import { CaseAccessPolicy, caseActions, type ActorContext } from "@fbe/access-policy";
import { prisma, type PrismaClient } from "@fbe/database";

export type CaseDeliveryJob = Readonly<{ accountId: string; caseId: string }>;
export type CaseDeliveryResult = Readonly<{
  delivered: boolean;
  reasonCode: string;
  payload?: Readonly<{ caseId: string; synthetic: true }>;
}>;

export class CaseDeliveryWorker {
  private readonly policy: CaseAccessPolicy;

  constructor(private readonly database: PrismaClient = prisma) {
    this.policy = new CaseAccessPolicy(database);
  }

  async execute(job: CaseDeliveryJob, at = new Date()): Promise<CaseDeliveryResult> {
    const account = await this.database.userAccount.findUnique({
      where: { id: job.accountId },
      include: {
        roles: {
          where: { startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
          include: { role: { include: { capabilities: { include: { capability: true } } } } },
        },
      },
    });
    if (!account || account.status !== "ACTIVE") {
      return { delivered: false, reasonCode: "ACCOUNT_INACTIVE" };
    }

    const actor: ActorContext = {
      accountId: account.id,
      authUserId: account.authUserId,
      personId: account.personId,
      roleCodes: account.roles.map(({ role }) => role.code),
      capabilities: [
        ...new Set(
          account.roles.flatMap(({ role }) => role.capabilities.map(({ capability }) => capability.code)),
        ),
      ],
    };
    const decision = await this.policy.authorizeCase(actor, caseActions.overviewRead, job.caseId, at);
    if (!decision.allowed) return { delivered: false, reasonCode: decision.reasonCode };
    return {
      delivered: true,
      reasonCode: decision.reasonCode,
      payload: { caseId: job.caseId, synthetic: true },
    };
  }
}

export { dispatchReminders, enqueueReminder } from "./reminders.js";
