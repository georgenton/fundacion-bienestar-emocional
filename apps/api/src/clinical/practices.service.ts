import { Injectable } from "@nestjs/common";
import { activeAccount, capabilities, practiceMember, practiceScope, type ActorContext } from "@fbe/access-policy";
import { ActivityKind, PracticeState, type Prisma, type Practice } from "@fbe/database";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { choice, flag, instant, integer, invalid, object, text, uuid } from "../operations/input.js";
import { audit, audited, clinicalTransaction, conflict, unavailable } from "./clinical-access.js";

function dayValue(value: unknown) {
  const day = text(value, 10, 10);
  return instant(`${day}T00:00:00Z`);
}

const ecuadorDay = (date: Date) => new Date(date.getTime() - 18_000_000).toISOString().slice(0, 10);
const active = (practice: Practice, now: Date) =>
  practice.state === "ACTIVE" && practice.startsAt <= now && practice.endsAt > now;

@Injectable()
export class PracticesService {
  constructor(private readonly policy: AccessPolicyService) {}

  async member(db: Prisma.TransactionClient, actor: ActorContext, id: string, now: Date) {
    const own = await practiceMember(db, actor, id, now);
    if (own) return own;
    if (!actor.capabilities.includes(capabilities.practiceCoordinate)) unavailable();
    await this.policy.requireCurrentCapability(db, actor, capabilities.practiceCoordinate, now);
    const practice = await db.practice.findUnique({ where: { id } });
    if (!practice) unavailable();
    return practice;
  }

  list(actor: ActorContext) {
    return clinicalTransaction(async (db, now) => {
      const coordinator = actor.capabilities.includes(capabilities.practiceCoordinate);
      if (coordinator) await this.policy.requireCurrentCapability(db, actor, capabilities.practiceCoordinate, now);
      return db.practice.findMany({ where: coordinator ? {} : practiceScope(actor),
        include: { intern: { select: { person: { select: { displayName: true } } } },
          supervisor: { select: { person: { select: { displayName: true } } } },
          _count: { select: { notes: { where: { status: "IN_REVIEW" } }, activities: { where: { status: "PENDING" } } } } },
        orderBy: { startsAt: "desc" }, take: 80 });
    });
  }

  details(actor: ActorContext, id: string) {
    return audited(actor, "PRACTICE_READ", "Practice", id, () => clinicalTransaction(async (db, now) => {
      const practice = await this.member(db, actor, id, now);
      const [activities, changes, supervisor] = await Promise.all([
        db.practiceActivity.findMany({ where: { practiceId: id }, orderBy: [{ day: "desc" }, { createdAt: "desc" }] }),
        db.practiceChange.findMany({ where: { practiceId: id }, orderBy: { version: "desc" } }),
        db.userAccount.findFirst({ where: { id: practice.supervisorId, ...activeAccount("SUPERVISOR", now) },
          select: { id: true } }),
      ]);
      await audit(db, actor, "PRACTICE_READ", "Practice", id);
      return { ...practice, activities, changes, current: active(practice, now), supervisorAvailable: Boolean(supervisor),
        canSubmit: actor.accountId === practice.internId && active(practice, now),
        canReview: actor.accountId === practice.supervisorId && actor.accountId !== practice.internId && Boolean(supervisor) };
    }));
  }

  register(actor: ActorContext, body: unknown) {
    const input = object(body);
    const internId = uuid(input.internId);
    const supervisorId = uuid(input.supervisorId);
    const institution = text(input.institution, 3, 150);
    const institutionalRef = text(input.institutionalRef, 3, 120);
    const startsAt = instant(input.startsAt);
    const endsAt = instant(input.endsAt);
    if (startsAt >= endsAt || internId === supervisorId) invalid("PRACTICE_PERIOD_INVALID");
    return clinicalTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capabilities.practiceCoordinate, now);
      if (!(await db.userAccount.findFirst({ where: { id: supervisorId, ...activeAccount("SUPERVISOR", now) } })) ||
          !(await db.userAccount.findFirst({ where: { id: internId, ...activeAccount("INTERN", now) } }))) unavailable();
      const practice = await db.practice.create({ data: { internId, supervisorId, institution, institutionalRef, startsAt, endsAt } });
      await audit(db, actor, "PRACTICE_REGISTER", "Practice", practice.id);
      return practice;
    });
  }

  change(actor: ActorContext, practiceId: string, body: unknown) {
    const input = object(body);
    const version = integer(input.version, 1, 2_147_483_646);
    const supervisorId = uuid(input.supervisorId);
    const state = choice(input.state, Object.values(PracticeState));
    const clinicalSimulation = flag(input.clinicalSimulation);
    const reason = text(input.reason, 3, 500);
    return audited(actor, "PRACTICE_CHANGE", "Practice", practiceId, () => clinicalTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capabilities.practiceCoordinate, now);
      const current = await db.practice.findUnique({ where: { id: practiceId } });
      if (!current || supervisorId === current.internId) unavailable();
      if (current.version !== version) conflict("RECORD_VERSION_CHANGED");
      if (state === "ACTIVE" &&
          !(await db.userAccount.findFirst({ where: { id: supervisorId, ...activeAccount("SUPERVISOR", now) } }))) unavailable();
      const changed = await db.practice.update({ where: { id: practiceId, version },
        data: { supervisorId, state, clinicalSimulation, version: { increment: 1 } } });
      await db.practiceChange.create({ data: {
        practiceId, actorId: actor.accountId, previousSupervisorId: current.supervisorId,
        supervisorId, state, clinicalSimulation, version: changed.version, reason,
      } });
      await audit(db, actor, "PRACTICE_CHANGE", "Practice", practiceId);
      return changed;
    }));
  }

  submit(actor: ActorContext, practiceId: string, body: unknown) {
    const input = object(body);
    const day = dayValue(input.day);
    const minutes = integer(input.minutes, 1, 480);
    const kind = choice(input.kind, Object.values(ActivityKind));
    const previousId = input.previousId ? uuid(input.previousId) : null;
    return audited(actor, "HOURS_SUBMIT", "Practice", practiceId, () => clinicalTransaction(async (db, now) => {
      const practice = await practiceMember(db, actor, practiceId, now);
      if (!practice || practice.internId !== actor.accountId || !active(practice, now)) unavailable();
      const dayText = day.toISOString().slice(0, 10);
      if (dayText < ecuadorDay(practice.startsAt) || dayText > ecuadorDay(now)) invalid("ACTIVITY_PERIOD_INVALID");
      if (previousId) {
        const changed = await db.practiceActivity.updateMany({
          where: { id: previousId, practiceId, status: "RETURNED" }, data: { status: "SUPERSEDED" },
        });
        if (changed.count !== 1) conflict("ACTIVITY_CORRECTION_INVALID");
      }
      const activity = await db.practiceActivity.create({ data: { practiceId, day, minutes, kind, previousId } });
      await audit(db, actor, "HOURS_SUBMIT", "PracticeActivity", activity.id);
      return activity;
    }));
  }

  review(actor: ActorContext, practiceId: string, id: string, body: unknown) {
    const input = object(body);
    const status = choice(input.status, ["APPROVED", "RETURNED"] as const);
    const reviewReason = status === "RETURNED" ? text(input.reason, 3, 500) : null;
    return audited(actor, "HOURS_REVIEW", "PracticeActivity", id, () => clinicalTransaction(async (db, now) => {
      const practice = await practiceMember(db, actor, practiceId, now);
      if (!practice || practice.supervisorId !== actor.accountId || practice.internId === actor.accountId) unavailable();
      const saved = await db.practiceActivity.updateManyAndReturn({
        where: { id, practiceId, status: "PENDING" }, data: { status, reviewReason, reviewedAt: now, reviewerId: actor.accountId },
      });
      if (saved.length !== 1) conflict("ACTIVITY_REVIEW_INVALID");
      await audit(db, actor, "HOURS_REVIEW", "PracticeActivity", id);
      return saved[0]!;
    }));
  }

  export(actor: ActorContext, practiceId: string) {
    return audited(actor, "HOURS_EXPORT", "Practice", practiceId, () => clinicalTransaction(async (db, now) => {
      await this.member(db, actor, practiceId, now);
      const entries = await db.practiceActivity.findMany({
        where: { practiceId, status: "APPROVED" }, select: { day: true, kind: true, minutes: true },
        orderBy: [{ day: "asc" }, { kind: "asc" }],
      });
      await audit(db, actor, "HOURS_EXPORT", "Practice", practiceId);
      return entries.map(({ day, kind, minutes }) => ({ day: day.toISOString().slice(0, 10), kind, minutes }));
    }));
  }
}
