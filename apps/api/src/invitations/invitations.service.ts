import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { loadConfig } from "@fbe/config";
import { prisma } from "@fbe/database";
import type { AuthenticatedActor } from "../auth/authenticated-request.js";
import { getEnrollmentAuth } from "../auth/auth.js";
import { capabilities } from "../access/access.types.js";
import { deliverInvitation } from "./invitation-delivery.js";

type CreateInvitationInput = Readonly<{ email?: unknown; displayName?: unknown; roleCode?: unknown }>;
type ActivateInvitationInput = Readonly<{ token?: unknown; password?: unknown }>;

@Injectable()
export class InvitationsService {
  async create(actor: AuthenticatedActor, input: CreateInvitationInput) {
    if (!actor.capabilities.includes(capabilities.accountInvite)) {
      throw new ForbiddenException({ code: "CAPABILITY_REQUIRED" });
    }
    if (
      typeof input.email !== "string" ||
      !input.email.endsWith("@example.test") ||
      typeof input.displayName !== "string" ||
      input.displayName.length < 3 ||
      typeof input.roleCode !== "string"
    ) {
      throw new BadRequestException({ code: "SYNTHETIC_INVITATION_INVALID" });
    }

    const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) throw new BadRequestException({ code: "ROLE_INVALID" });
    const token = randomBytes(32).toString("base64url");
    const tokenDigest = createHash("sha256").update(token).digest("hex");
    const invitation = await prisma.accountInvitation.create({
      data: {
        tokenDigest,
        email: input.email,
        displayName: input.displayName,
        roleId: role.id,
        invitedByAccountId: actor.accountId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      },
      select: { id: true, email: true, expiresAt: true },
    });
    await deliverInvitation({
      email: input.email,
      token,
      activationUrl: `${loadConfig().webOrigin}/activate?token=${encodeURIComponent(token)}`,
    });
    await prisma.auditEvent.create({
      data: {
        actorAccountId: actor.accountId,
        action: "ACCOUNT_INVITE",
        capability: capabilities.accountInvite,
        resourceType: "AccountInvitation",
        resourceId: invitation.id,
        decision: "ALLOWED",
        reasonCode: "SYNTHETIC_INVITATION_CREATED",
      },
    });
    return { id: invitation.id, expiresAt: invitation.expiresAt, delivery: "LOCAL_OUTBOX" };
  }

  async activate(input: ActivateInvitationInput) {
    if (typeof input.token !== "string" || input.token.length < 32 || typeof input.password !== "string" || input.password.length < 12) {
      throw new BadRequestException({ code: "ACTIVATION_INVALID" });
    }
    const tokenDigest = createHash("sha256").update(input.token).digest("hex");
    const invitation = await prisma.accountInvitation.findUnique({
      where: { tokenDigest },
      include: { role: true },
    });
    if (!invitation || invitation.usedAt || invitation.expiresAt <= new Date()) {
      throw new BadRequestException({ code: "ACTIVATION_INVALID" });
    }

    const consumed = await prisma.accountInvitation.updateMany({
      where: { id: invitation.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new BadRequestException({ code: "ACTIVATION_INVALID" });

    let authUserId: string | undefined;
    try {
      const signedUp = await getEnrollmentAuth().api.signUpEmail({
        body: { name: invitation.displayName, email: invitation.email, password: input.password },
      });
      const createdAuthUserId = signedUp.user.id;
      authUserId = createdAuthUserId;
      await prisma.$transaction(async (transaction) => {
        const person = await transaction.person.create({
          data: { displayName: invitation.displayName, contactEmail: invitation.email, synthetic: true },
        });
        const account = await transaction.userAccount.create({
          data: {
            authUserId: createdAuthUserId,
            personId: person.id,
            status: "ACTIVE",
            mfaRequired: invitation.role.isStaff,
            roles: { create: { roleId: invitation.roleId } },
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorAccountId: invitation.invitedByAccountId,
            action: "ACCOUNT_ACTIVATE",
            resourceType: "UserAccount",
            resourceId: account.id,
            decision: "ALLOWED",
            reasonCode: "INVITATION_TOKEN_CONSUMED",
          },
        });
      });
      return { activated: true, mfaEnrollmentRequired: invitation.role.isStaff };
    } catch {
      if (authUserId) await prisma.authUser.delete({ where: { id: authUserId } }).catch(() => undefined);
      await prisma.accountInvitation.update({ where: { id: invitation.id }, data: { usedAt: null } });
      throw new BadRequestException({ code: "ACTIVATION_INVALID" });
    }
  }
}
