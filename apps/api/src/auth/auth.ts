import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { Pool } from "pg";
import { loadConfig } from "@fbe/config";
import { deliverPasswordReset } from "./recovery-delivery.js";
import { mfaAuthHooks, mfaDatabaseHooks, mfaSessionOptions } from "./mfa-session-security.js";

const authPools = new Set<Pool>();

function createAuth(disableSignUp: boolean) {
  const config = loadConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 8,
    application_name: "fbe-auth",
  });
  authPools.add(pool);

  return betterAuth({
    appName: config.appName,
    baseURL: config.authUrl,
    basePath: "/api/auth",
    secret: config.authSecret,
    database: pool,
    trustedOrigins: [config.webOrigin],
    session: mfaSessionOptions,
    databaseHooks: mfaDatabaseHooks,
    hooks: mfaAuthHooks,
    // Better Auth otherwise infers this from NODE_ENV. Containers are built
    // with NODE_ENV=production even for the explicit local/test APP_ENV, so
    // use the validated application contract to keep tests deterministic.
    rateLimit: { enabled: config.appEnv === "production" },
    advanced: {
      database: { joins: true },
      cookiePrefix: "fbe",
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      requireEmailVerification: false,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: config.resetTokenTtlSeconds,
      sendResetPassword: async ({ user, url, token }) => {
        await deliverPasswordReset({ email: user.email, url, token });
      },
    },
    plugins: [
      twoFactor({
        issuer: config.appName,
        skipVerificationOnEnable: false,
        backupCodeOptions: {
          amount: 12,
          length: 10,
        },
      }),
    ],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;
let authInstance: AuthInstance | undefined;
let enrollmentAuthInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  authInstance ??= createAuth(true);
  return authInstance;
}

export function getEnrollmentAuth(): AuthInstance {
  enrollmentAuthInstance ??= createAuth(false);
  return enrollmentAuthInstance;
}

export function resetAuthForTests(): void {
  authInstance = undefined;
  enrollmentAuthInstance = undefined;
}

export async function closeAuthPool(): Promise<void> {
  await Promise.all([...authPools].map((pool) => pool.end()));
  authPools.clear();
  authInstance = undefined;
  enrollmentAuthInstance = undefined;
}
