import { Injectable } from "@nestjs/common";
import { activeAccount, activePeriod, caseActions, portalPatient, type ActorContext } from "@fbe/access-policy";
import { type Appointment, type Prisma } from "@fbe/database";
import { enqueueReminder } from "@fbe/worker";
import { agendaTransaction } from "../agenda/agenda-transaction.js";
import { audit, audited, conflict, unavailable } from "../clinical/clinical-access.js";
import { flag, object } from "../operations/input.js";
import { meetCapabilities, protectMeetLink, revealMeetLink } from "./meet-links.js";

const videoMeta = { provider: true, appointmentVersion: true, externalClosedAt: true, externalClosedById: true } as const;

@Injectable()
export class PortalService {
  private async patientAccount(db: Prisma.TransactionClient, actor: ActorContext, now: Date) {
    if (!actor.roleCodes.includes("PATIENT") || !await db.userAccount.findFirst({
      where: { id: actor.accountId, ...activeAccount("PATIENT", now) }, select: { id: true },
    })) unavailable();
  }

  preferences(actor: ActorContext, body?: unknown) {
    const enabled = body === undefined ? undefined : flag(object(body).enabled);
    return agendaTransaction(async (db, now) => {
      await this.patientAccount(db, actor, now);
      if (enabled !== undefined) {
        await db.reminderPreference.upsert({ where: { accountId: actor.accountId },
          create: { accountId: actor.accountId, enabled, updatedAt: now }, update: { enabled, updatedAt: now } });
        if (enabled) {
          const upcoming = await db.appointment.findMany({
            where: { status: "CONFIRMED", startsAt: { gt: now }, careCase: { synthetic: true, participants: { some: {
              personId: actor.personId, kind: "PATIENT", portalAccess: true, ...activePeriod(now),
            } } } },
            select: { id: true, caseId: true, version: true, startsAt: true },
          });
          for (const appointment of upcoming) await enqueueReminder(db, now, appointment, actor.accountId);
        }
        await audit(db, actor, "SYNTHETIC_REMINDER_CHANNEL_PREFERENCE", "UserAccount", actor.accountId);
      }
      return { enabled: (await db.reminderPreference.findUnique({ where: { accountId: actor.accountId } }))?.enabled ?? false,
        channel: "PRIVATE_TEST_INBOX" };
    });
  }

  inbox(actor: ActorContext) {
    return agendaTransaction(async (db, now) => {
      await this.patientAccount(db, actor, now);
      const jobs = await db.reminderJob.findMany({
        where: { accountId: actor.accountId, delivery: { isNot: null } }, orderBy: { scheduledAt: "desc" }, take: 80,
        select: { id: true, startsAt: true, scheduledAt: true, attemptedAt: true, appointmentVersion: true,
          appointment: { select: { caseId: true, version: true, status: true } }, delivery: true },
      });
      const messages = [];
      for (const { appointment, ...job } of jobs) {
        if (!await portalPatient(db, actor, appointment.caseId, now)) continue;
        messages.push({ id: job.id, startsAt: job.startsAt, scheduledAt: job.scheduledAt,
          attemptedAt: job.attemptedAt, deliveredAt: job.delivery?.deliveredAt, message: job.delivery?.message,
          current: appointment.status === "CONFIRMED" && appointment.version === job.appointmentVersion });
      }
      return messages;
    });
  }

  private async booking(db: Prisma.TransactionClient, id: string) {
    const appointment = await db.appointment.findFirst({ where: { id, modality: "ONLINE", careCase: { synthetic: true } } });
    if (!appointment) unavailable();
    return appointment;
  }

  private async isProfessional(db: Prisma.TransactionClient, actor: ActorContext, appointment: Appointment, now: Date) {
    return actor.accountId === appointment.professionalId && actor.roleCodes.includes("PROFESSIONAL") &&
      Boolean(await db.userAccount.findFirst({ where: { id: actor.accountId, ...activeAccount("PROFESSIONAL", now) }, select: { id: true } }));
  }

  private async hasAssignment(db: Prisma.TransactionClient, actor: ActorContext, appointment: Appointment, now: Date) {
    return await this.isProfessional(db, actor, appointment, now) && Boolean(await db.caseAssignment.findFirst({
      where: { accountId: actor.accountId, caseId: appointment.caseId, function: "TREATING_PROFESSIONAL", revokedAt: null,
        careCase: { status: "OPEN" },
        ...activePeriod(now), allowedActions: { has: caseActions.appointmentRead } }, select: { id: true },
    }));
  }

  private active(appointment: Appointment, now: Date) {
    return appointment.status === "CONFIRMED" && appointment.endsAt > now && appointment.attendance !== "NO_SHOW";
  }

  access(actor: ActorContext, id: string, reveal = false) {
    return audited(actor, "VIDEO_ACCESS", "Appointment", id, () => agendaTransaction(async (db, now) => {
      const appointment = await this.booking(db, id);
      const responsible = await this.isProfessional(db, actor, appointment, now);
      const assigned = responsible && await this.hasAssignment(db, actor, appointment, now);
      if (!responsible && (!await portalPatient(db, actor, appointment.caseId, now) ||
          !await db.careCase.findFirst({ where: { id: appointment.caseId, status: "OPEN" }, select: { id: true } }))) unavailable();
      const item = await db.videoMeeting.findUnique({ where: { appointmentId: id },
        select: { ...videoMeta, ...(reveal ? { encryptedLink: true as const } : {}) } });
      // Rescheduling creates another appointment. The registration version is
      // provenance, while recording attendance can advance the same booking.
      const valid = this.active(appointment, now) && Boolean(item && !item.externalClosedAt);
      if (reveal) {
        if (!valid || !item?.encryptedLink || (responsible && !assigned)) unavailable();
        await audit(db, actor, "VIDEO_PARTICIPANT_LINK", "Appointment", id);
        return { url: revealMeetLink(item.encryptedLink, id) };
      }
      return { ...meetCapabilities, canManage: assigned, available: valid && (!responsible || assigned), present: Boolean(item),
        externalPending: responsible && Boolean(item && !valid && !item.externalClosedAt),
        externalConfirmedAt: responsible ? item?.externalClosedAt ?? null : null };
    }));
  }

  register(actor: ActorContext, id: string, body: unknown) {
    const input = object(body);
    if (input.safetyChecked !== true) conflict("VIDEO_HOST_CHECK_REQUIRED");
    const protectedLink = protectMeetLink(input.url, id);
    return audited(actor, "VIDEO_REGISTER", "Appointment", id, () => agendaTransaction(async (db, now) => {
      const appointment = await this.booking(db, id);
      if (!await this.hasAssignment(db, actor, appointment, now)) unavailable();
      if (!this.active(appointment, now)) conflict("VIDEO_APPOINTMENT_INACTIVE");
      const existing = await db.videoMeeting.findUnique({ where: { appointmentId: id } });
      if (existing) {
        if (existing.linkDigest === protectedLink.linkDigest && !existing.externalClosedAt) return { id };
        conflict("VIDEO_ALREADY_REGISTERED");
      }
      if (await db.videoMeeting.findUnique({ where: { linkDigest: protectedLink.linkDigest }, select: { appointmentId: true } })) {
        conflict("VIDEO_LINK_ALREADY_USED");
      }
      await db.videoMeeting.create({ data: { appointmentId: id, appointmentVersion: appointment.version,
        managedById: actor.accountId, provider: meetCapabilities.provider, ...protectedLink } });
      await audit(db, actor, "VIDEO_REGISTER", "Appointment", id);
      return { id };
    }));
  }

  confirmExternal(actor: ActorContext, id: string, body: unknown) {
    if (object(body).observed !== true) conflict("VIDEO_HOST_CHECK_REQUIRED");
    return audited(actor, "VIDEO_EXTERNAL_CONFIRMATION", "Appointment", id, () => agendaTransaction(async (db, now) => {
      const appointment = await this.booking(db, id);
      if (!await this.isProfessional(db, actor, appointment, now)) unavailable();
      const item = await db.videoMeeting.findUnique({ where: { appointmentId: id }, select: videoMeta });
      if (!item) unavailable();
      if (item.externalClosedAt) return { id };
      if (this.active(appointment, now)) conflict("VIDEO_APPOINTMENT_ACTIVE");
      await db.videoMeeting.update({ where: { appointmentId: id }, data: { externalClosedAt: now, externalClosedById: actor.accountId } });
      await audit(db, actor, "VIDEO_EXTERNAL_CONFIRMATION", "Appointment", id);
      return { id };
    }));
  }
}
