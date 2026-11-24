import type { PrismaClient } from "@fbe/database";

export const caseActions = {
  overviewRead: "CASE_OVERVIEW_READ",
  clinicalRead: "CASE_CLINICAL_READ",
  export: "CASE_EXPORT",
} as const;

export type CaseAction = (typeof caseActions)[keyof typeof caseActions];

export const capabilities = {
  caseListAll: "case:list:all",
  caseOverviewRead: "case:overview:read",
  accountDisable: "account:disable",
  accountInvite: "account:invite",
  auditRead: "audit:read",
  technicalDiagnostics: "technical:diagnostics",
} as const;

export type ActorContext = Readonly<{
  accountId: string;
  authUserId: string;
  personId: string;
  roleCodes: readonly string[];
  capabilities: readonly string[];
}>;

export type AccessDecision = Readonly<{ allowed: boolean; reasonCode: string }>;

export class CaseAccessPolicy {
  constructor(private readonly database: PrismaClient) {}

  async authorizeCase(
    actor: ActorContext,
    action: CaseAction,
    caseId: string,
    at = new Date(),
  ): Promise<AccessDecision> {
    const careCase = await this.database.careCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        participants: {
          where: {
            personId: actor.personId,
            portalAccess: true,
            startsAt: { lte: at },
            OR: [{ endsAt: null }, { endsAt: { gt: at } }],
          },
          select: { id: true },
          take: 1,
        },
        assignments: {
          where: {
            accountId: actor.accountId,
            startsAt: { lte: at },
            revokedAt: null,
            OR: [{ endsAt: null }, { endsAt: { gt: at } }],
          },
          select: { allowedActions: true },
        },
      },
    });

    if (!careCase) return this.record(actor, action, caseId, false, "CASE_NOT_FOUND");
    const hasActiveAssignment = careCase.assignments.some(({ allowedActions }) => allowedActions.includes(action));
    const isPortalParticipant = careCase.participants.length > 0;
    const hasAdministrativeOverview =
      action === caseActions.overviewRead && actor.capabilities.includes(capabilities.caseOverviewRead);

    if (hasActiveAssignment) return this.record(actor, action, caseId, true, "ACTIVE_CASE_ASSIGNMENT");
    if (action === caseActions.overviewRead && isPortalParticipant) {
      return this.record(actor, action, caseId, true, "ACTIVE_CASE_PARTICIPANT");
    }
    if (hasAdministrativeOverview) return this.record(actor, action, caseId, true, "ADMINISTRATIVE_CAPABILITY");
    return this.record(actor, action, caseId, false, "NO_APPLICABLE_SCOPE");
  }

  async listCases(actor: ActorContext, at = new Date()) {
    const allOperationalCases = actor.capabilities.includes(capabilities.caseListAll);
    const scopedWhere = allOperationalCases
      ? {}
      : {
          OR: [
            {
              participants: {
                some: {
                  personId: actor.personId,
                  portalAccess: true,
                  startsAt: { lte: at },
                  OR: [{ endsAt: null }, { endsAt: { gt: at } }],
                },
              },
            },
            {
              assignments: {
                some: {
                  accountId: actor.accountId,
                  // Operational list metadata requires its own read action;
                  // clinical/export permission alone does not imply it.
                  allowedActions: { has: caseActions.overviewRead },
                  startsAt: { lte: at },
                  revokedAt: null,
                  OR: [{ endsAt: null }, { endsAt: { gt: at } }],
                },
              },
            },
          ],
        };
    const cases = await this.database.careCase.findMany({
      where: scopedWhere,
      select: { id: true, referenceCode: true, status: true },
      orderBy: { referenceCode: "asc" },
    });
    await this.database.auditEvent.create({
      data: {
        actorAccountId: actor.accountId,
        action: "CASE_LIST",
        capability: allOperationalCases ? capabilities.caseListAll : null,
        resourceType: "CareCase",
        decision: "ALLOWED",
        reasonCode: allOperationalCases ? "ADMINISTRATIVE_SCOPE" : "IDENTITY_OR_ASSIGNMENT_SCOPE",
        context: { resultCount: cases.length },
      },
    });
    return cases;
  }

  private async record(
    actor: ActorContext,
    action: CaseAction,
    caseId: string,
    allowed: boolean,
    reasonCode: string,
  ): Promise<AccessDecision> {
    await this.database.auditEvent.create({
      data: {
        actorAccountId: actor.accountId,
        action,
        resourceType: "CareCase",
        resourceId: caseId,
        decision: allowed ? "ALLOWED" : "DENIED",
        reasonCode,
      },
    });
    return { allowed, reasonCode };
  }
}
