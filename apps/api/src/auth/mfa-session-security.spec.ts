import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { twoFactor } from "better-auth/plugins";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { hasVerifiedMfa, mfaAuthHooks, mfaDatabaseHooks, mfaSessionOptions } from "./mfa-session-security.js";

// These exercise the actual installed auth library without a server/DB. The
// PostgreSQL suite separately verifies persistence, migration and Nest guards.

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function requestHeaders(cookie = ""): Headers {
  return new Headers({ host: "localhost:3001", origin: "http://localhost:3000", cookie });
}

function responseCookie(result: { headers: Headers }): string {
  return result.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

async function fixture(secure = true) {
  const waiting = deferred();
  const resume = deferred();
  let pauseNextSignIn = false;
  const data = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  const auth = betterAuth({
    appName: "Synthetic MFA regression",
    baseURL: "http://localhost:3001",
    secret: randomBytes(32).toString("hex"),
    database: memoryAdapter(data),
    trustedOrigins: ["http://localhost:3000"],
    rateLimit: { enabled: false },
    emailAndPassword: { enabled: true, autoSignIn: false },
    session: mfaSessionOptions,
    ...(secure ? {
      hooks: mfaAuthHooks,
      databaseHooks: {
        ...mfaDatabaseHooks,
        session: {
          create: {
            before: async (_session, context) => {
              if (pauseNextSignIn && context?.path === "/sign-in/email") {
                pauseNextSignIn = false;
                waiting.resolve();
                await resume.promise;
              }
              return mfaDatabaseHooks.session.create.before();
            },
          },
        },
      },
    } : {}),
    plugins: [twoFactor({ issuer: "Synthetic MFA regression", skipVerificationOnEnable: false })],
  });
  const email = "mfa-regression@example.test";
  const password = `Synthetic!${randomBytes(20).toString("base64url")}`;
  await auth.api.signUpEmail({ body: { name: "Synthetic user", email, password } });

  const signIn = () => auth.api.signInEmail({
    returnHeaders: true,
    headers: requestHeaders(),
    body: { email, password },
  });
  const getSession = (cookie: string) => auth.api.getSession({ headers: requestHeaders(cookie) });
  async function enroll(cookie: string) {
    const enabled = await auth.api.enableTwoFactor({
      headers: requestHeaders(cookie), body: { password, method: "totp" },
    });
    if (enabled.method !== "totp") throw new Error("Missing synthetic TOTP setup");
    const secret = new URL(enabled.totpURI).searchParams.get("secret");
    if (!secret) throw new Error("Missing synthetic secret");
    const otp = createOTP(base32.decode(secret));
    const verified = await auth.api.verifyTOTP({
      returnHeaders: true,
      headers: requestHeaders(cookie),
      body: { code: await otp.totp(), trustDevice: false },
    });
    return { cookie: responseCookie(verified), otp, backupCodes: enabled.backupCodes };
  }
  return {
    auth, signIn, getSession, enroll, password,
    pauseSignIn: () => { pauseNextSignIn = true; },
    waiting: waiting.promise,
    resume: resume.resolve,
  };
}

describe("per-session MFA assurance with Better Auth", () => {
  it("negative control: enrollment alone upgrades the user flag on a second password-only session", async () => {
    const f = await fixture(false);
    const first = responseCookie(await f.signIn());
    const second = responseCookie(await f.signIn());
    expect((await f.getSession(second))?.user.twoFactorEnabled).not.toBe(true);
    await f.enroll(first);
    const remaining = await f.getSession(second);
    expect(remaining).not.toBeNull();
    expect(remaining?.user.twoFactorEnabled).toBe(true);
    expect(remaining && hasVerifiedMfa(remaining)).toBe(false);
  });

  it("revokes both old sessions at enrollment and grants assurance only to the verified replacement", async () => {
    const f = await fixture();
    const first = responseCookie(await f.signIn());
    const second = responseCookie(await f.signIn());
    const forged = await f.auth.handler(new Request("http://localhost:3001/api/auth/update-session", {
      method: "POST",
      headers: { ...Object.fromEntries(requestHeaders(second)), "content-type": "application/json" },
      body: JSON.stringify({ mfaVerified: true }),
    }));
    expect(forged.status).toBe(400);
    expect((await f.getSession(second))?.session.mfaVerified).toBe(false);
    const enrolled = await f.enroll(first);
    expect(await f.getSession(first)).toBeNull();
    expect(await f.getSession(second)).toBeNull();
    const replacement = await f.getSession(enrolled.cookie);
    expect(replacement && hasVerifiedMfa(replacement)).toBe(true);
  });

  it("denies a password session created after the enrollment sweep and protects factor management", async () => {
    const f = await fixture();
    const first = responseCookie(await f.signIn());
    f.pauseSignIn();
    const lateSignIn = f.signIn();
    await f.waiting;
    try {
      await f.enroll(first);
    } finally {
      f.resume();
    }
    const lateCookie = responseCookie(await lateSignIn);
    const lateSession = await f.getSession(lateCookie);
    expect(lateSession?.user.twoFactorEnabled).toBe(true);
    expect(lateSession?.session.mfaVerified).toBe(false);
    expect(lateSession && hasVerifiedMfa(lateSession)).toBe(false);
    await expect(f.auth.api.disableTwoFactor({
      headers: requestHeaders(lateCookie), body: { password: f.password },
    })).rejects.toMatchObject({ statusCode: 403, body: { code: "MFA_VERIFICATION_REQUIRED" } });
    await expect(f.auth.api.generateBackupCodes({
      headers: requestHeaders(lateCookie), body: { password: f.password },
    })).rejects.toMatchObject({ statusCode: 403 });
    expect((await f.getSession(lateCookie))?.user.twoFactorEnabled).toBe(true);
  });

  it("marks successful TOTP and backup-code sign-ins; rejects an invalid or reused factor", async () => {
    const f = await fixture();
    const enrolled = await f.enroll(responseCookie(await f.signIn()));
    const pendingTotp = responseCookie(await f.signIn());
    expect(await f.getSession(pendingTotp)).toBeNull();
    await expect(f.auth.api.verifyTOTP({
      headers: requestHeaders(pendingTotp), body: { code: "invalid", trustDevice: false },
    })).rejects.toMatchObject({ statusCode: 401 });
    expect(await f.getSession(pendingTotp)).toBeNull();
    const totp = await f.auth.api.verifyTOTP({
      returnHeaders: true,
      headers: requestHeaders(pendingTotp),
      body: { code: await enrolled.otp.totp(), trustDevice: false },
    });
    const totpSession = await f.getSession(responseCookie(totp));
    expect(totpSession && hasVerifiedMfa(totpSession)).toBe(true);

    const backupCode = enrolled.backupCodes[0]!;
    const pendingBackup = responseCookie(await f.signIn());
    const backup = await f.auth.api.verifyBackupCode({
      returnHeaders: true,
      headers: requestHeaders(pendingBackup), body: { code: backupCode, trustDevice: false },
    });
    const backupSession = await f.getSession(responseCookie(backup));
    expect(backupSession && hasVerifiedMfa(backupSession)).toBe(true);
    const reusedPending = responseCookie(await f.signIn());
    await expect(f.auth.api.verifyBackupCode({
      headers: requestHeaders(reusedPending), body: { code: backupCode, trustDevice: false },
    })).rejects.toMatchObject({ statusCode: 401 });
    expect(await f.getSession(reusedPending)).toBeNull();
  });
});
