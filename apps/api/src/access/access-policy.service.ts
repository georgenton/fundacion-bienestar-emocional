import { ForbiddenException, Injectable } from "@nestjs/common";
import { activePeriod, CaseAccessPolicy, type ActorContext } from "@fbe/access-policy";
import { prisma, type Prisma } from "@fbe/database";

@Injectable()
export class AccessPolicyService extends CaseAccessPolicy {
  constructor() {
    super(prisma);
  }

  async requireCapability(actor: ActorContext, capability: string, resourceType: string, resourceId?: string) {
    if (actor.capabilities.includes(capability)) return;
    await prisma.auditEvent.create({
      data: {
        actorAccountId: actor.accountId, action: "OPERATION_DENIED", capability,
        resourceType, resourceId: resourceId ?? null, decision: "DENIED", reasonCode: "CAPABILITY_REQUIRED",
      },
    });
    throw new ForbiddenException({ code: "CAPABILITY_REQUIRED" });
  }

  async requireCurrentCapability(db: Prisma.TransactionClient, actor: ActorContext, capability: string, at: Date) {
    const grant = await db.accountRole.findFirst({
      where: {
        accountId: actor.accountId, ...activePeriod(at),
        account: { status: "ACTIVE" },
        role: { capabilities: { some: { capability: { code: capability } } } },
      },
      select: { roleId: true },
    });
    if (!grant) throw new ForbiddenException({ code: "CAPABILITY_REQUIRED" });
  }

  async recordOperation(
    db: Prisma.TransactionClient, actor: ActorContext, capability: string,
    action: string, resourceType: string, resourceId?: string, context?: Prisma.InputJsonObject,
  ) {
    await db.auditEvent.create({
      data: {
        actorAccountId: actor.accountId, capability, action, resourceType, resourceId: resourceId ?? null,
        decision: "ALLOWED", reasonCode: "ADMINISTRATIVE_SCOPE", ...(context ? { context } : {}),
      },
    });
  }
}
