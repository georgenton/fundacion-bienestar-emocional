import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@fbe/database";
import type { AuthenticatedActor } from "../auth/authenticated-request.js";
import { capabilities } from "../access/access.types.js";

@Injectable()
export class AccountsService {
  async disable(actor: AuthenticatedActor, accountId: string): Promise<{ disabled: true }> {
    if (!actor.capabilities.includes(capabilities.accountDisable)) {
      throw new ForbiddenException({ code: "CAPABILITY_REQUIRED" });
    }

    const target = await prisma.userAccount.findUnique({ where: { id: accountId } });
    if (!target) {
      throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    }

    await prisma.$transaction([
      prisma.userAccount.update({
        where: { id: target.id },
        data: { status: "DISABLED", disabledAt: new Date() },
      }),
      prisma.authSession.deleteMany({ where: { userId: target.authUserId } }),
      prisma.auditEvent.create({
        data: {
          actorAccountId: actor.accountId,
          action: "ACCOUNT_DISABLE",
          capability: capabilities.accountDisable,
          resourceType: "UserAccount",
          resourceId: target.id,
          decision: "ALLOWED",
          reasonCode: "EXPLICIT_ADMINISTRATIVE_ACTION",
        },
      }),
    ]);
    return { disabled: true };
  }
}
