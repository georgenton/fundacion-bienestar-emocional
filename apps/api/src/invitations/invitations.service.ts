import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { hashPassword } from "better-auth/crypto";
import { loadConfig } from "@fbe/config";
import { prisma, Prisma } from "@fbe/database";
import type { AuthenticatedActor } from "../auth/authenticated-request.js";
import { AccessPolicyService } from "../access/access-policy.service.js";
import { capabilities } from "../access/access.types.js";
import { invalid, object, syntheticEmail, text, uuid } from "../operations/input.js";
import { deliverInvitation } from "./invitation-delivery.js";

const activationInvalid = () => invalid("ACTIVATION_INVALID");

@Injectable()
export class InvitationsService {
  constructor(private readonly policy: AccessPolicyService) {}

  async create(actor: AuthenticatedActor, body: unknown) {
    const input = object(body);
    const personId = input.personId === undefined ? undefined : uuid(input.personId);
    const capability = personId ? capabilities.patientInvite : capabilities.accountInvite;
    await this.policy.requireCapability(actor, capability, "AccountInvitation");
    const config = loadConfig();
    if (config.appEnv === "production" && !config.allowSyntheticInvitations) {
      throw new ServiceUnavailableException({ code: "INVITATION_DELIVERY_NOT_CONFIGURED" });
    }

    const email = syntheticEmail(input.email);
    if (personId && input.roleCode !== undefined && input.roleCode !== "PATIENT") invalid("PATIENT_ROLE_REQUIRED");
    const roleCode = personId ? "PATIENT" : text(input.roleCode, 2, 50);
    if (roleCode === "FINANCE") await this.policy.requireCapability(actor, capabilities.financeGrant, "AccountInvitation");
    const displayName = personId ? undefined : text(input.displayName, 3, 120);
    const token = randomBytes(32).toString("base64url");
    const tokenDigest = createHash("sha256").update(token).digest("hex");

    const invitation = await prisma.$transaction(async (db) => {
      const now = new Date();
      await this.policy.requireCurrentCapability(db, actor, capability, now);
      if (roleCode === "FINANCE") await this.policy.requireCurrentCapability(db, actor, capabilities.financeGrant, now);
      const role = await db.role.findUnique({ where: { code: roleCode } });
      if (!role || role.code === "CLINICAL_COORDINATOR" ||
          (personId && (role.isStaff || role.isClinical))) invalid("ROLE_INVALID");
      const person = personId && await db.person.findFirst({
        where: { id: personId, synthetic: true, archivedAt: null },
        select: { displayName: true, userAccount: { select: { id: true } } },
      });
      if (personId && !person) throw new NotFoundException({ code: "PERSON_NOT_AVAILABLE" });
      if ((person && person.userAccount) || await db.authUser.findUnique({ where: { email }, select: { id: true } })) {
        throw new ConflictException({ code: "ACCOUNT_ALREADY_LINKED" });
      }

      const created = await db.accountInvitation.create({
        data: {
          tokenDigest, email, displayName: person ? person.displayName : displayName!, personId: personId ?? null,
          roleId: role.id, invitedByAccountId: actor.accountId, expiresAt: new Date(now.getTime() + 86_400_000),
        },
        select: { id: true, expiresAt: true },
      });
      await this.policy.recordOperation(db, actor, capability, "ACCOUNT_INVITE", "AccountInvitation", created.id);
      return created;
    });

    await deliverInvitation({
      email, token,
      activationUrl: `${config.webOrigin}/activate#token=${encodeURIComponent(token)}`,
    });
    return { ...invitation, delivery: "LOCAL_OUTBOX" };
  }

  async activate(body: unknown) {
    const { token, password, ...extra } = object(body);
    if (Object.keys(extra).length || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
        typeof password !== "string" || password.length < 12 || password.length > 128) {
      return activationInvalid();
    }
    const tokenDigest = createHash("sha256").update(token).digest("hex");
    const candidate = await prisma.accountInvitation.findUnique({
      where: { tokenDigest }, select: { id: true, expiresAt: true, usedAt: true },
    });
    if (!candidate || candidate.usedAt || candidate.expiresAt <= new Date()) return activationInvalid();

    // Better Auth still owns password hashing and authentication. Its sign-up
    // API uses a separate connection, so use its credential record contract
    // here to commit identity, linkage and token consumption together.
    const passwordHash = await hashPassword(password);
    try {
      return await prisma.$transaction(async (db) => {
        const invitation = await db.accountInvitation.findUniqueOrThrow({
          where: { id: candidate.id }, include: { role: true },
        });
        if (invitation.personId) {
          await db.$executeRaw`SELECT id FROM "Person" WHERE id = ${invitation.personId}::uuid FOR UPDATE`;
        }
        const [clock] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
        const now = clock!.now;
        const consumed = await db.accountInvitation.updateMany({
          where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
        });
        if (consumed.count !== 1) return activationInvalid();

        const person = invitation.personId
          ? await db.person.findFirst({
              where: { id: invitation.personId, archivedAt: null, synthetic: true, userAccount: null },
              select: { id: true, displayName: true },
            })
          : await db.person.create({
              data: { displayName: invitation.displayName, contactEmail: invitation.email, synthetic: true },
              select: { id: true, displayName: true },
            });
        if (!person || (invitation.personId && (invitation.role.code !== "PATIENT" ||
            invitation.role.isStaff || invitation.role.isClinical))) return activationInvalid();

        const authUserId = randomUUID();
        await db.authUser.create({
          data: {
            id: authUserId, name: person.displayName, email: invitation.email,
            authAccounts: {
              create: { id: randomUUID(), accountId: authUserId, providerId: "credential", password: passwordHash },
            },
          },
          select: { id: true },
        });
        const account = await db.userAccount.create({
          data: {
            authUserId, personId: person.id, status: "ACTIVE",
            mfaRequired: invitation.role.isStaff, roles: { create: { roleId: invitation.roleId } },
          },
          select: { id: true },
        });
        await db.auditEvent.create({
          data: {
            actorAccountId: invitation.invitedByAccountId, action: "ACCOUNT_ACTIVATE",
            resourceType: "UserAccount", resourceId: account.id, decision: "ALLOWED",
            reasonCode: "INVITATION_TOKEN_CONSUMED",
          },
        });
        return { activated: true, mfaEnrollmentRequired: invitation.role.isStaff };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return activationInvalid();
      throw error;
    }
  }
}
