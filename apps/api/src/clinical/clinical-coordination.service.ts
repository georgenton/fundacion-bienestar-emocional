import { Injectable } from "@nestjs/common";
import { activeAccount, activePeriod, assignmentRoles, capabilities, clinicalGrants, type ActorContext } from "@fbe/access-policy";
import { prisma } from "@fbe/database";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { choice, instant, invalid, object, uuid } from "../operations/input.js";
import { audit, audited, clinicalTransaction, conflict, unavailable } from "./clinical-access.js";

@Injectable()
export class ClinicalCoordinationService {
  constructor(private readonly policy: AccessPolicyService) {}

  async directory(actor: ActorContext) {
    await this.policy.requireCapability(actor, capabilities.clinicalCoordinate, "CaseAssignment");
    const now = new Date();
    const people = await prisma.userAccount.findMany({
      where: { OR: Object.values(assignmentRoles).map(role => activeAccount(role, now)) },
      select: { id: true, person: { select: { displayName: true } },
        roles: { where: activePeriod(now), select: { role: { select: { code: true } } } } },
      orderBy: { person: { displayName: "asc" } }, take: 100,
    });
    return people.map(({ id, person, roles }) => ({ id, name: person.displayName, roles: roles.map(item => item.role.code) }));
  }

  grants(actor: ActorContext, caseId: string) {
    return clinicalTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capabilities.clinicalCoordinate, now);
      if (!(await db.careCase.findFirst({ where: { id: caseId, synthetic: true }, select: { id: true } }))) unavailable();
      return db.caseAssignment.findMany({ where: { caseId, allowedActions: { has: "RECORD_READ" } },
        select: { id: true, function: true, accountId: true, practiceId: true, startsAt: true, endsAt: true, revokedAt: true,
          account: { select: { person: { select: { displayName: true } } } } }, orderBy: { startsAt: "desc" } });
    });
  }

  grant(actor: ActorContext, caseId: string, body: unknown) {
    const input = object(body);
    const accountId = uuid(input.accountId);
    const operation = choice(input.function, ["TREATING_PROFESSIONAL", "SUPERVISOR", "INTERN"] as const);
    const practiceId = operation === "INTERN" ? uuid(input.practiceId) : null;
    const endsAt = input.endsAt ? instant(input.endsAt) : null;
    return audited(actor, "CLINICAL_GRANT", "CareCase", caseId, () => clinicalTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capabilities.clinicalCoordinate, now);
      if (accountId === actor.accountId) unavailable();
      if (endsAt && endsAt <= now) invalid("ASSIGNMENT_PERIOD_INVALID");
      if (!(await db.careCase.findFirst({ where: { id: caseId, synthetic: true, status: "OPEN" }, select: { id: true } })) ||
          !(await db.userAccount.findFirst({ where: { id: accountId, ...activeAccount(assignmentRoles[operation], now) },
            select: { id: true } }))) unavailable();
      const practice = practiceId && await db.practice.findFirst({
        where: { id: practiceId, internId: accountId, state: "ACTIVE", clinicalSimulation: true, startsAt: { lte: now }, endsAt: { gt: now } },
      });
      if (practiceId && !practice) conflict("PRACTICE_SIMULATION_REQUIRED");
      const until = practice ? new Date(Math.min(practice.endsAt.getTime(), endsAt?.getTime() ?? Infinity)) : endsAt;
      if (await db.caseAssignment.findFirst({
        where: { caseId, accountId, function: operation, practiceId, revokedAt: null, ...activePeriod(now),
          allowedActions: { has: "RECORD_READ" } }, select: { id: true },
      })) conflict("CLINICAL_ASSIGNMENT_EXISTS");
      const grant = await db.caseAssignment.create({ data: {
        caseId, accountId, function: operation, practiceId, startsAt: now, endsAt: until,
        allowedActions: clinicalGrants[operation],
      } });
      await audit(db, actor, "CLINICAL_GRANT", "CaseAssignment", grant.id);
      return grant;
    }));
  }

  revoke(actor: ActorContext, caseId: string, id: string) {
    return audited(actor, "CLINICAL_REVOKE", "CaseAssignment", id, () => clinicalTransaction(async (db, now) => {
      await this.policy.requireCurrentCapability(db, actor, capabilities.clinicalCoordinate, now);
      const grant = await db.caseAssignment.findFirst({ where: { id, caseId, careCase: { synthetic: true },
        allowedActions: { has: "RECORD_READ" } } });
      if (!grant) unavailable();
      if (grant.revokedAt) return grant;
      const saved = await db.caseAssignment.update({ where: { id }, data: { revokedAt: now } });
      await audit(db, actor, "CLINICAL_REVOKE", "CaseAssignment", id);
      return saved;
    }));
  }
}
