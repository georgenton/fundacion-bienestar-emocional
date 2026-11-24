import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx, isAPIError } from "better-auth/api";

// A user's enrollment flag is not evidence that a particular session passed
// MFA. In particular, a password sign-in can overlap initial enrollment.
export const mfaSessionOptions = {
  cookieCache: { enabled: false },
  additionalFields: {
    mfaVerified: {
      type: "boolean",
      required: true,
      defaultValue: false,
      input: false,
    },
  },
} satisfies NonNullable<BetterAuthOptions["session"]>;

type MfaSession = {
  user: { twoFactorEnabled?: boolean | null | undefined };
  session: { mfaVerified?: boolean | null | undefined };
};

export function hasVerifiedMfa(session: MfaSession): boolean {
  return session.user.twoFactorEnabled === true && session.session.mfaVerified === true;
}

export const mfaDatabaseHooks = {
  session: {
    create: {
      // Do not inherit assurance when Better Auth rotates/copies a session.
      // Only a successful verifier below may grant it to the new session.
      before: async () => ({ data: { mfaVerified: false } }),
    },
  },
  user: {
    update: {
      before: async (user, context) => {
        if ((user as { twoFactorEnabled?: boolean }).twoFactorEnabled !== true) return;
        const userId = context?.context.session?.user.id;
        if (!userId || context?.path !== "/two-factor/verify-totp") {
          throw new APIError("FORBIDDEN", { code: "MFA_VERIFICATION_REQUIRED" });
        }
        // The library will create a fresh session after verified enrollment.
        // This sweep is defense in depth; mfaVerified also covers a concurrent
        // password session created after this deletion has completed.
        await context.context.internalAdapter.deleteUserSessions(userId);
      },
    },
  },
} satisfies NonNullable<BetterAuthOptions["databaseHooks"]>;

const verificationPaths = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);
const unverifiedSessionPaths = new Set([
  ...verificationPaths,
  "/get-session",
  "/sign-out",
  "/sign-in/email",
  "/request-password-reset",
  "/reset-password",
]);

export const mfaAuthHooks = {
  before: createAuthMiddleware(async (context) => {
    if (unverifiedSessionPaths.has(context.path)) return;
    const session = await getAuthoritativeSessionFromCtx(context);
    if (session?.user.twoFactorEnabled === true && !hasVerifiedMfa(session as MfaSession)) {
      // These requests include factor replacement, backup-code generation,
      // password/profile changes and session management. Protecting only the
      // Nest controllers would leave the provider's own routes exposed.
      throw new APIError("FORBIDDEN", { code: "MFA_VERIFICATION_REQUIRED" });
    }
  }),
  after: createAuthMiddleware(async (context) => {
    if (!verificationPaths.has(context.path) || isAPIError(context.context.returned)) return;
    const result = context.context.returned;
    if (!result || typeof result !== "object" || !("token" in result) || typeof result.token !== "string") {
      return;
    }

    // Enrollment rotates the session cookie, while its response body can
    // still name the old token. Use the server's new/current session context.
    const session = context.context.newSession ?? context.context.session;
    if (!session || session.user.twoFactorEnabled !== true) return;
    const updated = await context.context.internalAdapter.updateSession(session.session.token, {
      mfaVerified: true,
    });
    if (!updated) throw new APIError("UNAUTHORIZED", { code: "AUTHENTICATION_REQUIRED" });
  }),
} satisfies NonNullable<BetterAuthOptions["hooks"]>;
