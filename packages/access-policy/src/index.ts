import type { Prisma, PrismaClient } from "@fbe/database";

export const caseActions = {
  overviewRead: "CASE_OVERVIEW_READ",
  appointmentRead: "CASE_APPOINTMENT_READ",
  clinicalRead: "CASE_CLINICAL_READ",
  export: "CASE_EXPORT",
  recordRead: "RECORD_READ",
  encounterOpen: "ENCOUNTER_OPEN",
  noteWrite: "NOTE_WRITE",
  noteSubmit: "NOTE_SUBMIT",
  noteReview: "NOTE_REVIEW",
  noteValidate: "NOTE_VALIDATE",
  addendumWrite: "ADDENDUM_WRITE",
  consentManage: "CONSENT_MANAGE",
  attachmentRead: "ATTACHMENT_READ",
  attachmentWrite: "ATTACHMENT_WRITE",
  attachmentShare: "ATTACHMENT_SHARE",
  informationHandle: "INFORMATION_HANDLE",
} as const;

export type CaseAction = (typeof caseActions)[keyof typeof caseActions];

export const capabilities = {
  caseListAll: "case:list:all",
  caseOverviewRead: "case:overview:read",
  accountDisable: "account:disable",
  accountInvite: "account:invite",
  auditRead: "audit:read",
  technicalDiagnostics: "technical:diagnostics",
  personManage: "person:manage",
  caseManage: "case:manage",
  patientInvite: "patient:invite",
  agendaManage: "agenda:manage",
  agendaConfigure: "agenda:configure",
  clinicalCoordinate: "case:clinical:coordinate",
  financeRegister: "finance:register",
  financeVerify: "finance:verify",
  financeApprove: "finance:approve",
  financeExecute: "finance:execute",
  financeGrant: "finance:grant",
  practiceCoordinate: "practice:coordinate",
} as const;

export type ActorContext = Readonly<{
  accountId: string;
  authUserId: string;
  personId: string;
  roleCodes: readonly string[];
  capabilities: readonly string[];
}>;

export type AccessDecision = Readonly<{ allowed: boolean; reasonCode: string }>;

export function activePeriod(at: Date) {
  return { startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] };
}

export function activeRole(code: string, at: Date): Prisma.AccountRoleWhereInput {
  return { ...activePeriod(at), role: { code } };
}

export function appointmentScope(actor: ActorContext, at: Date): Prisma.AppointmentWhereInput {
  if (actor.capabilities.includes(capabilities.agendaManage)) return {};

  const scopes: Prisma.AppointmentWhereInput[] = [];
  if (actor.roleCodes.includes("PROFESSIONAL")) {
    scopes.push({
      professionalId: actor.accountId,
      careCase: {
        assignments: {
          some: {
            accountId: actor.accountId,
            ...activePeriod(at),
            revokedAt: null,
            allowedActions: { has: caseActions.appointmentRead },
          },
        },
      },
    });
  }
  if (actor.roleCodes.includes("PATIENT")) {
    scopes.push({
      careCase: {
        participants: {
          some: { personId: actor.personId, kind: "PATIENT", portalAccess: true, ...activePeriod(at) },
        },
      },
    });
  }
  return { OR: scopes, status: { in: ["CONFIRMED", "CANCELLED", "RESCHEDULED"] } };
}

export class CaseAccessPolicy {
  constructor(private readonly database: PrismaClient) {}

  async authorizeCase(
    actor: ActorContext,
    action: CaseAction,
    caseId: string,
    at = new Date(),
  ): Promise<AccessDecision> {
    if (clinicalActions.has(action)) {
      const grant = await clinicalAssignment(this.database, actor, caseId, action, at);
      return this.record(actor, action, caseId, Boolean(grant), grant ? "ACTIVE_CLINICAL_ASSIGNMENT" : "NO_APPLICABLE_SCOPE");
    }
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
    const hasActiveAssignment = careCase.assignments.some(({ allowedActions }) =>
      allowedActions.includes(action) && !allowedActions.includes(caseActions.recordRead));
    const clinicalOverview = action === caseActions.overviewRead &&
      careCase.assignments.some(({ allowedActions }) => allowedActions.includes(caseActions.recordRead)) &&
      await clinicalAssignment(this.database, actor, caseId, caseActions.recordRead, at);
    const isPortalParticipant = careCase.participants.length > 0;
    const hasAdministrativeOverview =
      action === caseActions.overviewRead && actor.capabilities.includes(capabilities.caseOverviewRead);

    if (hasActiveAssignment || clinicalOverview) return this.record(actor, action, caseId, true, "ACTIVE_CASE_ASSIGNMENT");
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
    const candidates = await this.database.careCase.findMany({
      where: scopedWhere,
      select: {
        id: true, referenceCode: true, status: true, serviceId: true, modality: true,
        participants: { where: { personId: actor.personId, portalAccess: true, ...activePeriod(at) }, select: { id: true }, take: 1 },
        assignments: { where: { accountId: actor.accountId, ...activePeriod(at), revokedAt: null,
          allowedActions: { has: caseActions.overviewRead } }, select: { allowedActions: true } },
      },
      orderBy: { referenceCode: "asc" },
    });
    const cases = [];
    for (const { participants, assignments, ...summary } of candidates) {
      if (allOperationalCases || participants.length || assignments.some(grant => !grant.allowedActions.includes(caseActions.recordRead)) ||
          await clinicalAssignment(this.database, actor, summary.id, caseActions.recordRead, at)) {
        cases.push(summary);
      }
    }
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

export const assignmentRoles = {
  TREATING_PROFESSIONAL: "PROFESSIONAL",
  SUPERVISOR: "SUPERVISOR",
  INTERN: "INTERN",
} as const;
export type ClinicalFunction = keyof typeof assignmentRoles;

const recordReadActions = [
  caseActions.overviewRead, caseActions.recordRead, caseActions.noteWrite, caseActions.noteSubmit,
];
const documentActions = [caseActions.attachmentRead, caseActions.attachmentWrite, caseActions.attachmentShare,
  caseActions.informationHandle, caseActions.consentManage];
export const clinicalGrants = {
  TREATING_PROFESSIONAL: [...recordReadActions, ...documentActions, caseActions.encounterOpen,
    caseActions.noteValidate, caseActions.addendumWrite],
  SUPERVISOR: [...recordReadActions, ...documentActions, caseActions.noteReview,
    caseActions.noteValidate, caseActions.addendumWrite],
  INTERN: recordReadActions,
} satisfies Record<ClinicalFunction, CaseAction[]>;

const clinicalActions = new Set<CaseAction>(
  Object.values(clinicalGrants).flat().filter(action => action !== caseActions.overviewRead),
);

export function activeAccount(role: string, at: Date): Prisma.UserAccountWhereInput {
  return { status: "ACTIVE", roles: { some: activeRole(role, at) }, person: { synthetic: true, archivedAt: null } };
}

export async function portalPatient(db: Prisma.TransactionClient, actor: ActorContext, caseId: string, at: Date) {
  if (!actor.roleCodes.includes("PATIENT")) return false;
  return Boolean(await db.caseParticipant.findFirst({
    where: {
      caseId, personId: actor.personId, kind: "PATIENT", portalAccess: true, ...activePeriod(at),
      careCase: { synthetic: true },
      person: { userAccount: { is: { id: actor.accountId, ...activeAccount("PATIENT", at) } } },
    },
    select: { id: true },
  }));
}

export function currentConsent(db: Prisma.TransactionClient, caseId: string, personId: string,
  purpose: "CARE" | "INTERN_PARTICIPATION") {
  return db.consentRecord.findFirst({
    where: { caseId, personId, template: { purpose } },
    orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    include: { template: true },
  });
}

export async function clinicalAssignment(db: Prisma.TransactionClient, actor: ActorContext, caseId: string,
  action: CaseAction, at: Date, assignmentId?: string) {
  const assignments = await db.caseAssignment.findMany({
    where: { caseId, ...(assignmentId ? { id: assignmentId } : {}), accountId: actor.accountId,
      ...activePeriod(at), revokedAt: null, allowedActions: { has: action }, careCase: { synthetic: true } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    include: { practice: true },
  });
  for (const assignment of assignments) {
    const role = assignmentRoles[assignment.function];
    const grant = (clinicalGrants[assignment.function] as readonly CaseAction[]).includes(action);
    if (!grant || !actor.roleCodes.includes(role) ||
        !(await db.userAccount.findFirst({ where: { id: actor.accountId, ...activeAccount(role, at) }, select: { id: true } }))) continue;
    if (assignment.function !== "INTERN") return assignment;
    const practice = assignment.practice;
    if (!practice || practice.internId !== actor.accountId || practice.state !== "ACTIVE" || !practice.clinicalSimulation ||
        practice.startsAt > at || practice.endsAt <= at || practice.supervisorId === actor.accountId) continue;
    const supervisor = await db.caseAssignment.findFirst({
      where: { caseId, accountId: practice.supervisorId, function: "SUPERVISOR", ...activePeriod(at),
        revokedAt: null, allowedActions: { has: caseActions.noteReview }, account: activeAccount("SUPERVISOR", at) },
      select: { id: true },
    });
    const patient = await db.caseParticipant.findFirst({
      where: { caseId, kind: "PATIENT", ...activePeriod(at) }, select: { personId: true },
    });
    const consent = patient && await currentConsent(db, caseId, patient.personId, "INTERN_PARTICIPATION");
    if (supervisor && consent && !consent.withdrawnAt) return assignment;
  }
  return null;
}

export function practiceScope(actor: ActorContext): Prisma.PracticeWhereInput {
  return {
    OR: [
      ...(actor.roleCodes.includes("INTERN") ? [{ internId: actor.accountId }] : []),
      ...(actor.roleCodes.includes("SUPERVISOR") ? [{ supervisorId: actor.accountId }] : []),
    ],
  };
}

export async function practiceMember(db: Prisma.TransactionClient, actor: ActorContext, practiceId: string, at: Date) {
  return db.practice.findFirst({
    where: {
      id: practiceId,
      OR: [
        ...(actor.roleCodes.includes("INTERN") ? [{ internId: actor.accountId, intern: activeAccount("INTERN", at) }] : []),
        ...(actor.roleCodes.includes("SUPERVISOR") ?
          [{ supervisorId: actor.accountId, supervisor: activeAccount("SUPERVISOR", at) }] : []),
      ],
    },
  });
}
