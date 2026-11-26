import { createHash } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { activeRole, appointmentScope, capabilities, caseActions, type ActorContext } from "@fbe/access-policy";
import { CancellationParty, Prisma, prisma, type Appointment, type AppointmentModality } from "@fbe/database";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { choice, instant, integer, invalid, object, text, uuid } from "../operations/input.js";
import { agendaTransaction } from "./agenda-transaction.js";

const minute = 60_000;
const holdDuration = 10 * minute;
const timezone = "America/Guayaquil";
const capability = capabilities.agendaManage;
const localClock = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", hour: "2-digit",
  minute: "2-digit", hourCycle: "h23" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const appointmentFields = {
  id: true, caseId: true, professionalId: true, serviceName: true, modality: true,
  startsAt: true, endsAt: true, occupiedUntil: true, durationMinutes: true, marginMinutes: true,
  currency: true, amountMinor: true, holdExpiresAt: true, status: true, attendance: true,
  cancellationParty: true, previousId: true, version: true,
  careCase: { select: { referenceCode: true } },
  professional: { select: { person: { select: { displayName: true } } } },
} satisfies Prisma.AppointmentSelect;

type AppointmentView = Prisma.AppointmentGetPayload<{ select: typeof appointmentFields }>;
type Slot = { professionalId: string; startsAt: Date; endsAt: Date; occupiedUntil: Date };

function conflict(code: string): never {
  throw new ConflictException({ code });
}

function slotFor(professionalId: string, startsAt: Date, duration: number, margin: number): Slot {
  const endsAt = new Date(startsAt.getTime() + duration * minute);
  return { professionalId, startsAt, endsAt, occupiedUntil: new Date(endsAt.getTime() + margin * minute) };
}

function requireFuture(startsAt: Date, now: Date) {
  if (startsAt <= now || startsAt.getTime() > now.getTime() + 366 * 86_400_000 ||
      startsAt.getUTCSeconds() || startsAt.getUTCMilliseconds()) invalid("APPOINTMENT_START_INVALID");
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly policy: AccessPolicyService) {}

  async list(actor: ActorContext, start: unknown, end: unknown, professional: unknown) {
    const canManage = actor.capabilities.includes(capability);
    if (!canManage && !actor.roleCodes.some(role => role === "PROFESSIONAL" || role === "PATIENT")) {
      await this.policy.requireCapability(actor, capability, "Appointment");
    }
    const startsAt = instant(start);
    const endsAt = instant(end);
    if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 7 * 86_400_000) invalid("AGENDA_RANGE_INVALID");
    const professionalId = professional === undefined ? undefined : uuid(professional);
    const now = new Date();
    const appointments = await prisma.appointment.findMany({
      where: {
        ...(professionalId ? { professionalId } : {}), careCase: { synthetic: true }, startsAt: { lt: endsAt }, occupiedUntil: { gt: startsAt },
        AND: [
          appointmentScope(actor, now),
          { OR: [{ status: { notIn: ["HELD", "EXPIRED"] } }, { status: "HELD", holdExpiresAt: { gt: now } }] },
        ],
      },
      select: appointmentFields,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 500,
    });

    await prisma.auditEvent.create({
      data: {
        actorAccountId: actor.accountId, action: "APPOINTMENT_LIST", capability: canManage ? capability : null,
        resourceType: "Appointment", decision: "ALLOWED",
        reasonCode: canManage ? "ADMINISTRATIVE_SCOPE" : "IDENTITY_OR_ASSIGNMENT_SCOPE",
        context: { resultCount: appointments.length },
      },
    });
    return { timezone, appointments };
  }

  hold(actor: ActorContext, body: unknown) {
    const input = object(body);
    const caseId = uuid(input.caseId);
    const professionalId = uuid(input.professionalId);
    const startsAt = instant(input.startsAt);
    return this.mutate(actor, input.requestId, "APPOINTMENT_HOLD", { caseId, professionalId, startsAt },
      async (db, now) => {
        requireFuture(startsAt, now);
        const { service, modality } = await this.requireCase(db, caseId);
        const slot = slotFor(professionalId, startsAt, service.durationMinutes, service.marginMinutes);
        const tariff = await db.serviceTariff.findFirst({
          where: { serviceId: service.id, startsAt: { lte: startsAt } },
          orderBy: { startsAt: "desc" },
        });
        if (!tariff) invalid("SERVICE_TARIFF_REQUIRED");
        await this.requireAvailable(db, now, caseId, service.id, slot);
        return db.appointment.create({
          data: {
            ...slot, caseId, serviceId: service.id, tariffId: tariff.id, serviceName: service.name, modality,
            durationMinutes: service.durationMinutes, marginMinutes: service.marginMinutes,
            currency: tariff.currency, amountMinor: tariff.amountMinor, createdByAccountId: actor.accountId,
            holdExpiresAt: new Date(Math.min(now.getTime() + holdDuration, startsAt.getTime())),
          },
          select: appointmentFields,
        });
      });
  }

  confirm(actor: ActorContext, id: string, body: unknown) {
    const input = object(body);
    const version = integer(input.version, 1, 2_147_483_646);
    return this.mutate(actor, input.requestId, "APPOINTMENT_CONFIRM", { id, version }, async (db, now) => {
      const appointment = await this.current(db, id, version);
      if (appointment.status !== "HELD") conflict("APPOINTMENT_NOT_HELD");
      if (appointment.createdByAccountId !== actor.accountId) conflict("HOLD_OWNER_REQUIRED");
      if (!appointment.holdExpiresAt || appointment.holdExpiresAt <= now) conflict("HOLD_EXPIRED");
      requireFuture(appointment.startsAt, now);
      await this.requireCase(db, appointment.caseId, appointment);
      await this.requireAvailable(db, now, appointment.caseId, appointment.serviceId, appointment, id);
      return db.appointment.update({
        where: { id }, data: { status: "CONFIRMED", holdExpiresAt: null, version: { increment: 1 } },
        select: appointmentFields,
      });
    });
  }

  reschedule(actor: ActorContext, id: string, body: unknown) {
    const input = object(body);
    const version = integer(input.version, 1, 2_147_483_646);
    const professionalId = uuid(input.professionalId);
    const startsAt = instant(input.startsAt);
    const reason = text(input.reason, 3, 160);
    return this.mutate(actor, input.requestId, "APPOINTMENT_RESCHEDULE", { id, version, professionalId, startsAt, reason },
      async (db, now) => {
        const original = await this.current(db, id, version);
        if (original.status !== "CONFIRMED" || original.attendance !== "UNRECORDED") conflict("APPOINTMENT_NOT_EDITABLE");
        requireFuture(startsAt, now);
        if (original.professionalId === professionalId && original.startsAt.getTime() === startsAt.getTime()) {
          conflict("APPOINTMENT_UNCHANGED");
        }
        await this.requireCase(db, original.caseId, original);
        const slot = slotFor(professionalId, startsAt, original.durationMinutes, original.marginMinutes);
        await this.requireAvailable(db, now, original.caseId, original.serviceId, slot, id);
        await db.appointment.update({
          where: { id }, data: { status: "RESCHEDULED", changeReason: reason, version: { increment: 1 } },
        });
        return db.appointment.create({
          data: {
            ...slot, previousId: id, caseId: original.caseId, serviceId: original.serviceId,
            tariffId: original.tariffId, serviceName: original.serviceName, modality: original.modality,
            durationMinutes: original.durationMinutes, marginMinutes: original.marginMinutes,
            currency: original.currency, amountMinor: original.amountMinor, status: "CONFIRMED",
            createdByAccountId: actor.accountId,
          },
          select: appointmentFields,
        });
      });
  }

  cancel(actor: ActorContext, id: string, body: unknown) {
    const input = object(body);
    const version = integer(input.version, 1, 2_147_483_646);
    const party = choice(input.party, Object.values(CancellationParty));
    const reason = text(input.reason, 3, 160);
    return this.mutate(actor, input.requestId, "APPOINTMENT_CANCEL", { id, version, party, reason },
      async (db, now) => {
        const appointment = await this.current(db, id, version);
        if (appointment.attendance !== "UNRECORDED" || !["HELD", "CONFIRMED"].includes(appointment.status)) {
          conflict("APPOINTMENT_NOT_EDITABLE");
        }
        if (appointment.status === "HELD" && appointment.holdExpiresAt! <= now) conflict("HOLD_EXPIRED");
        return db.appointment.update({
          where: { id },
          data: {
            status: "CANCELLED", holdExpiresAt: null, cancellationParty: party, changeReason: reason,
            version: { increment: 1 },
          },
          select: appointmentFields,
        });
      });
  }

  attendance(actor: ActorContext, id: string, body: unknown) {
    const input = object(body);
    const version = integer(input.version, 1, 2_147_483_646);
    const attendance = choice(input.attendance, ["ATTENDED", "NO_SHOW"]);
    return this.mutate(actor, input.requestId, "APPOINTMENT_ATTENDANCE", { id, version, attendance },
      async (db, now) => {
        const appointment = await this.current(db, id, version);
        if (appointment.status !== "CONFIRMED" || appointment.attendance !== "UNRECORDED") {
          conflict("APPOINTMENT_NOT_EDITABLE");
        }
        if (appointment.startsAt > now) conflict("APPOINTMENT_NOT_STARTED");
        return db.appointment.update({
          where: { id }, data: { attendance, version: { increment: 1 } }, select: appointmentFields,
        });
      });
  }

  private async mutate(
    actor: ActorContext, requestId: unknown, action: string, parameters: Record<string, unknown>,
    write: (db: Prisma.TransactionClient, now: Date) => Promise<AppointmentView>,
  ) {
    await this.policy.requireCapability(actor, capability, "Appointment");
    const key = text(requestId, 8, 100);
    if (!/^[A-Za-z0-9_-]+$/.test(key)) invalid("REQUEST_ID_INVALID");
    const fingerprint = createHash("sha256").update(JSON.stringify({ action, parameters })).digest("hex");
    try {
      return await agendaTransaction(async (db, now) => {
        await this.policy.requireCurrentCapability(db, actor, capability, now);
        const previous = await db.agendaRequest.findUnique({ where: { actorId_key: { actorId: actor.accountId, key } } });
        if (previous) {
          if (previous.fingerprint !== fingerprint) conflict("REQUEST_ID_CONFLICT");
          return previous.result;
        }
        const result = await write(db, now);
        const response = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonObject;
        await db.agendaRequest.create({ data: { actorId: actor.accountId, key, fingerprint, result: response } });
        const originalId = result.previousId && action === "APPOINTMENT_RESCHEDULE" ? result.previousId : null;
        await this.policy.recordOperation(db, actor, capability, action, "Appointment", result.id, {
          version: result.version, originalId, attendance: result.attendance, cancellationParty: result.cancellationParty,
        });
        return response;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004" &&
          /appointment_professional_occupied|23P01/i.test(JSON.stringify(error.meta))) conflict("APPOINTMENT_CONFLICT");
      throw error;
    }
  }

  private async current(db: Prisma.TransactionClient, id: string, version: number) {
    const appointment = await db.appointment.findFirst({ where: { id, careCase: { synthetic: true } } });
    if (!appointment) throw new NotFoundException({ code: "APPOINTMENT_NOT_AVAILABLE" });
    if (appointment.version !== version) conflict("APPOINTMENT_STALE");
    return appointment;
  }

  private async requireCase(
    db: Prisma.TransactionClient, caseId: string, snapshot?: Pick<Appointment, "serviceId" | "modality">,
  ) {
    const careCase = await db.careCase.findFirst({
      where: { id: caseId, status: "OPEN", synthetic: true },
      select: { modality: true, service: true },
    });
    if (!careCase?.modality || !careCase.service) invalid("CASE_NOT_BOOKABLE");
    const { modality, service } = careCase;
    if (!service.enabled || !service.modalities.includes(modality)) invalid("SERVICE_MODALITY_DISABLED");
    if (snapshot && (snapshot.serviceId !== service.id || snapshot.modality !== modality)) {
      conflict("CASE_SERVICE_CHANGED");
    }
    return { service, modality };
  }

  private async requireAvailable(
    db: Prisma.TransactionClient, now: Date, caseId: string, serviceId: string, slot: Slot, exclude?: string,
  ) {
    const { professionalId, startsAt, occupiedUntil } = slot;
    const eligible = await db.serviceProfessional.findFirst({
      where: {
        professionalId, serviceId, enabled: true,
        professional: {
          status: "ACTIVE", person: { synthetic: true, archivedAt: null },
          AND: [{ roles: { some: activeRole("PROFESSIONAL", now) } }, { roles: { some: activeRole("PROFESSIONAL", startsAt) } }],
        },
      },
      select: { professionalId: true },
    });
    if (!eligible) invalid("PROFESSIONAL_NOT_ELIGIBLE");

    const assignment = await db.caseAssignment.findFirst({
      where: {
        caseId, accountId: professionalId, function: "TREATING_PROFESSIONAL",
        allowedActions: { has: caseActions.appointmentRead }, revokedAt: null,
        startsAt: { lte: startsAt }, OR: [{ endsAt: null }, { endsAt: { gte: occupiedUntil } }],
      },
      select: { id: true },
    });
    if (!assignment) invalid("PROFESSIONAL_NOT_ASSIGNED");

    const parts = localClock.formatToParts(startsAt);
    const weekday = weekdays.indexOf(parts.find(part => part.type === "weekday")!.value) + 1;
    const startsMinute = Number(parts.find(part => part.type === "hour")!.value) * 60 +
      Number(parts.find(part => part.type === "minute")!.value);
    const hours = await db.professionalHours.findUnique({ where: { professionalId_weekday: { professionalId, weekday } } });
    if (!hours || startsMinute < hours.opensMinute ||
        startsMinute + (occupiedUntil.getTime() - startsAt.getTime()) / minute > hours.closesMinute) {
      conflict("OUTSIDE_PROFESSIONAL_HOURS");
    }

    const absence = await db.professionalAbsence.findFirst({
      where: { professionalId, startsAt: { lt: occupiedUntil }, endsAt: { gt: startsAt } },
      select: { id: true },
    });
    if (absence) conflict("PROFESSIONAL_ABSENT");

    // This write releases expired ranges in the same transaction as a new claim.
    // The exclusion constraint is the final guard, including outside this API.
    await db.appointment.updateMany({
      where: { professionalId, status: "HELD", holdExpiresAt: { lte: now } },
      data: { status: "EXPIRED", version: { increment: 1 } },
    });
    const occupied = await db.appointment.findFirst({
      where: {
        professionalId, ...(exclude ? { id: { not: exclude } } : {}),
        status: { in: ["CONFIRMED", "HELD"] }, startsAt: { lt: occupiedUntil }, occupiedUntil: { gt: startsAt },
      },
      select: { id: true },
    });
    if (occupied) conflict("APPOINTMENT_CONFLICT");
  }
}
