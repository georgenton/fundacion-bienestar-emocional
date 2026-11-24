import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { prisma } from "@fbe/database";
import { loadConfig } from "@fbe/config";
import { getAuth } from "./auth.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import { hasVerifiedMfa } from "./mfa-session-security.js";
import { assertCookieMutationOrigin } from "./mutation-origin.js";

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    assertCookieMutationOrigin(request, loadConfig().webOrigin);
    const session = await getAuth().api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableCookieCache: true },
    });

    if (!session) {
      throw new UnauthorizedException({ code: "AUTHENTICATION_REQUIRED" });
    }

    const account = await prisma.userAccount.findUnique({
      where: { authUserId: session.user.id },
      include: {
        roles: {
          where: {
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          include: {
            role: {
              include: { capabilities: { include: { capability: true } } },
            },
          },
        },
      },
    });

    if (!account || account.status !== "ACTIVE") {
      throw new UnauthorizedException({ code: "ACCOUNT_INACTIVE" });
    }

    if (account.mfaRequired && session.user.twoFactorEnabled !== true) {
      throw new ForbiddenException({ code: "MFA_ENROLLMENT_REQUIRED" });
    }
    // An enrolled optional factor must protect the session as well. Account
    // policy decides enrollment; enrollment always requires session assurance.
    if (session.user.twoFactorEnabled === true && !hasVerifiedMfa(session)) {
      throw new ForbiddenException({ code: "MFA_VERIFICATION_REQUIRED" });
    }

    const roleCodes = account.roles.map(({ role }) => role.code);
    const capabilities = [
      ...new Set(
        account.roles.flatMap(({ role }) =>
          role.capabilities.map(({ capability }) => capability.code),
        ),
      ),
    ];

    (request as AuthenticatedRequest).actor = {
      accountId: account.id,
      authUserId: account.authUserId,
      personId: account.personId,
      roleCodes,
      capabilities,
    };
    return true;
  }
}
