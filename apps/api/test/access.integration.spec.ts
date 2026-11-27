import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@fbe/database";
import { CaseDeliveryWorker } from "@fbe/worker";
import { closeAuthPool } from "../src/auth/auth.js";
import { takeTestResetMessage } from "../src/auth/recovery-delivery.js";
import { takeTestInvitation } from "../src/invitations/invitation-delivery.js";
import { createApp } from "../src/main.js";

type ActorCredential = {
  email: string;
  password: string;
  accountId: string;
  personId: string;
  role: string;
  mfaRequired: boolean;
  totpSecret?: string;
  backupCodes?: string[];
};

type FixtureFile = {
  synthetic: true;
  cases: { caseA: string; caseB: string };
  actors: Record<string, ActorCredential>;
};

let app: INestApplication;
let fixtures: FixtureFile;

function cookieHeader(response: request.Response): string {
  const raw = response.headers["set-cookie"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

async function beginSignIn(actor: ActorCredential, password = actor.password) {
  return request(app.getHttpServer())
    .post("/api/auth/sign-in/email")
    .set("Origin", "http://localhost:3000")
    .send({ email: actor.email, password, rememberMe: false });
}

async function authenticatedCookie(actor: ActorCredential): Promise<string> {
  const signIn = await beginSignIn(actor);
  expect(signIn.status).toBe(200);
  if (!actor.mfaRequired) return cookieHeader(signIn);

  expect(signIn.body.twoFactorRedirect).toBe(true);
  expect(actor.totpSecret).toBeTruthy();
  const code = await createOTP(base32.decode(actor.totpSecret!)).totp();
  const verified = await request(app.getHttpServer())
    .post("/api/auth/two-factor/verify-totp")
    .set("Origin", "http://localhost:3000")
    .set("Cookie", cookieHeader(signIn))
    .send({ code, trustDevice: false });
  expect(verified.status).toBe(200);
  return cookieHeader(verified);
}

beforeAll(async () => {
  fixtures = JSON.parse(
    await readFile(resolve(process.cwd(), "../../.local/demo-credentials.json"), "utf8"),
  ) as FixtureFile;
  app = await createApp();
});

afterAll(async () => {
  await app.close();
  await closeAuthPool();
  await prisma.$disconnect();
});

describe("PostgreSQL identity and access demonstration", () => {
  it("reports database health without exposing configuration", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "reachable", syntheticDataOnly: true });
    expect(JSON.stringify(response.body)).not.toContain("postgresql://");
  });

  it("limits a patient by identity and participation", async () => {
    const cookie = await authenticatedCookie(fixtures.actors.patient!);
    const listed = await request(app.getHttpServer()).get("/api/cases").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.map((item: { referenceCode: string }) => item.referenceCode)).toEqual(["SYN-CASE-A"]);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/overview`).set("Cookie", cookie)).status,
    ).toBe(200);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/clinical`).set("Cookie", cookie)).status,
    ).toBe(404);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseB}/overview`).set("Cookie", cookie)).status,
    ).toBe(404);
  });

  it("lets reception see operational overviews but never clinical content", async () => {
    const cookie = await authenticatedCookie(fixtures.actors.reception!);
    const listed = await request(app.getHttpServer()).get("/api/cases").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    // Other integration journeys may have added cases to the shared database.
    // Reception can list operational metadata, but never clinical fields.
    expect(listed.body.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([fixtures.cases.caseA, fixtures.cases.caseB]),
    );
    for (const item of listed.body) {
      expect(Object.keys(item).sort()).toEqual(["id", "modality", "referenceCode", "serviceId", "status"]);
    }
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseB}/overview`).set("Cookie", cookie)).status,
    ).toBe(200);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/clinical`).set("Cookie", cookie)).status,
    ).toBe(404);
  });

  it("requires a current assignment for a professional and revokes it mid-session", async () => {
    const actor = fixtures.actors.professional!;
    const cookie = await authenticatedCookie(actor);
    const worker = new CaseDeliveryWorker(prisma);
    const queuedJob = { accountId: actor.accountId, caseId: fixtures.cases.caseA };
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/clinical`).set("Cookie", cookie)).status,
    ).toBe(200);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseB}/clinical`).set("Cookie", cookie)).status,
    ).toBe(404);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/export`).set("Cookie", cookie)).status,
    ).toBe(200);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseB}/export`).set("Cookie", cookie)).status,
    ).toBe(404);
    expect((await worker.execute(queuedJob)).delivered).toBe(true);

    await prisma.caseAssignment.updateMany({
      where: { caseId: fixtures.cases.caseA, accountId: actor.accountId },
      data: { revokedAt: new Date() },
    });
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/clinical`).set("Cookie", cookie)).status,
    ).toBe(404);
    expect((await worker.execute(queuedJob)).delivered).toBe(false);
    await prisma.caseAssignment.updateMany({
      where: { caseId: fixtures.cases.caseA, accountId: actor.accountId },
      data: { revokedAt: null },
    });

    await prisma.caseAssignment.updateMany({
      where: { caseId: fixtures.cases.caseA, accountId: actor.accountId },
      data: { endsAt: new Date(Date.now() - 1_000) },
    });
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/clinical`).set("Cookie", cookie)).status,
    ).toBe(404);
    expect((await worker.execute(queuedJob)).delivered).toBe(false);
    await prisma.caseAssignment.updateMany({
      where: { caseId: fixtures.cases.caseA, accountId: actor.accountId },
      data: { endsAt: null },
    });
  });

  it("gives support no application-level case access", async () => {
    const cookie = await authenticatedCookie(fixtures.actors.support!);
    const listed = await request(app.getHttpServer()).get("/api/cases").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([]);
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/overview`).set("Cookie", cookie)).status,
    ).toBe(404);
  });

  it("does not turn an operations administrator into a clinical reader", async () => {
    const cookie = await authenticatedCookie(fixtures.actors.operationsAdmin!);
    const visible = await request(app.getHttpServer()).get("/api/cases").set("Cookie", cookie);
    expect(visible.status).toBe(200);
    expect(visible.body.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([
      fixtures.cases.caseA, fixtures.cases.caseB,
    ]));
    expect(
      (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/clinical`).set("Cookie", cookie)).status,
    ).toBe(404);
  });

  it("requires and consumes a staff recovery code as a real second factor", async () => {
    const actor = fixtures.actors.intern!;
    const code = actor.backupCodes![0]!;
    const pending = await beginSignIn(actor);
    const pendingCookie = cookieHeader(pending);
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", pendingCookie)).status).toBe(401);

    const recovered = await request(app.getHttpServer())
      .post("/api/auth/two-factor/verify-backup-code")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", pendingCookie)
      .send({ code, trustDevice: false });
    expect(recovered.status).toBe(200);

    const secondPending = await beginSignIn(actor);
    const reused = await request(app.getHttpServer())
      .post("/api/auth/two-factor/verify-backup-code")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", cookieHeader(secondPending))
      .send({ code, trustDevice: false });
    expect(reused.status).toBe(401);
  });

  it("expires and consumes password reset tokens without account enumeration", async () => {
    const patient = fixtures.actors.patient!;
    const known = await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .set("Origin", "http://localhost:3000")
      .send({ email: patient.email });
    const unknown = await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .set("Origin", "http://localhost:3000")
      .send({ email: "missing-user@example.test" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    const reset = takeTestResetMessage(patient.email);
    expect(reset).toBeTruthy();
    const changed = await request(app.getHttpServer())
      .post("/api/auth/reset-password")
      .set("Origin", "http://localhost:3000")
      .send({ token: reset!.token, newPassword: "Changed-Synthetic-Password!9" });
    expect(changed.status).toBe(200);
    const reused = await request(app.getHttpServer())
      .post("/api/auth/reset-password")
      .set("Origin", "http://localhost:3000")
      .send({ token: reset!.token, newPassword: "Another-Synthetic-Password!9" });
    expect(reused.status).toBe(400);

    await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .set("Origin", "http://localhost:3000")
      .send({ email: patient.email });
    const expired = takeTestResetMessage(patient.email)!;
    await prisma.authVerification.updateMany({
      where: { identifier: `reset-password:${expired.token}` },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/reset-password")
          .set("Origin", "http://localhost:3000")
          .send({ token: expired.token, newPassword: "Expired-Synthetic-Password!9" })
      ).status,
    ).toBe(400);

    await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .set("Origin", "http://localhost:3000")
      .send({ email: patient.email });
    const restore = takeTestResetMessage(patient.email)!;
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/reset-password")
          .set("Origin", "http://localhost:3000")
          .send({ token: restore.token, newPassword: patient.password })
      ).status,
    ).toBe(200);
  });

  it("revokes staff sessions on password recovery without bypassing MFA", async () => {
    const actor = fixtures.actors.supervisor!;
    const activeCookie = await authenticatedCookie(actor);
    const changedPassword = "Changed-Staff-Synthetic-Password!9";

    await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email });
    const reset = takeTestResetMessage(actor.email)!;
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/reset-password")
          .set("Origin", "http://localhost:3000")
          .send({ token: reset.token, newPassword: changedPassword })
      ).status,
    ).toBe(200);
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", activeCookie)).status).toBe(401);

    const pending = await beginSignIn(actor, changedPassword);
    expect(pending.status).toBe(200);
    expect(pending.body.twoFactorRedirect).toBe(true);
    const pendingCookie = cookieHeader(pending);
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", pendingCookie)).status).toBe(401);
    const code = await createOTP(base32.decode(actor.totpSecret!)).totp();
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/two-factor/verify-totp")
          .set("Origin", "http://localhost:3000")
          .set("Cookie", pendingCookie)
          .send({ code, trustDevice: false })
      ).status,
    ).toBe(200);

    await request(app.getHttpServer())
      .post("/api/auth/request-password-reset")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email });
    const restore = takeTestResetMessage(actor.email)!;
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/auth/reset-password")
          .set("Origin", "http://localhost:3000")
          .send({ token: restore.token, newPassword: actor.password })
      ).status,
    ).toBe(200);
  });

  it("activates a synthetic invitation once and rejects reuse or expiry", async () => {
    const adminCookie = await authenticatedCookie(fixtures.actors.operationsAdmin!);
    const email = "invited-patient@example.test";
    const created = await request(app.getHttpServer())
      .post("/api/invitations")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", adminCookie)
      .send({ email, displayName: "Paciente Invitado Sintético", roleCode: "PATIENT" });
    expect(created.status).toBe(201);
    const invitation = takeTestInvitation(email);
    expect(invitation).toBeTruthy();

    const activated = await request(app.getHttpServer())
      .post("/api/invitations/activate")
      .send({ token: invitation!.token, password: "Invitation-Synthetic-Password!9" });
    expect(activated.status).toBe(201);
    expect(activated.body).toEqual({ activated: true, mfaEnrollmentRequired: false });
    const reused = await request(app.getHttpServer())
      .post("/api/invitations/activate")
      .send({ token: invitation!.token, password: "Invitation-Synthetic-Password!9" });
    expect(reused.status).toBe(400);

    const expiredEmail = "expired-invitation@example.test";
    await request(app.getHttpServer())
      .post("/api/invitations")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", adminCookie)
      .send({ email: expiredEmail, displayName: "Invitación Expirada Sintética", roleCode: "PATIENT" });
    const expired = takeTestInvitation(expiredEmail)!;
    const digest = createHash("sha256").update(expired.token).digest("hex");
    await prisma.accountInvitation.update({
      where: { tokenDigest: digest },
      data: {
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/invitations/activate")
          .send({ token: expired.token, password: "Expired-Synthetic-Password!9" })
      ).status,
    ).toBe(400);
  });

  it("requires session-specific MFA when newly invited staff enroll with two password sessions", async () => {
    const adminCookie = await authenticatedCookie(fixtures.actors.operationsAdmin!);
    const email = "invited-staff-mfa@example.test";
    const password = "Invited-Staff-Synthetic-Password!9";
    const created = await request(app.getHttpServer())
      .post("/api/invitations")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", adminCookie)
      .send({ email, displayName: "Profesional Invitado Sintético", roleCode: "PROFESSIONAL" });
    expect(created.status).toBe(201);
    const invitation = takeTestInvitation(email)!;
    const activated = await request(app.getHttpServer())
      .post("/api/invitations/activate")
      .send({ token: invitation.token, password });
    expect(activated.status).toBe(201);
    expect(activated.body.mfaEnrollmentRequired).toBe(true);
    const passwordSignIn = () => request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("Origin", "http://localhost:3000")
      .send({ email, password });
    const firstCookie = cookieHeader(await passwordSignIn());
    const secondCookie = cookieHeader(await passwordSignIn());
    const before = await request(app.getHttpServer()).get("/api/me").set("Cookie", secondCookie);
    expect(before.status).toBe(403);
    expect(before.body.code).toBe("MFA_ENROLLMENT_REQUIRED");

    const enabled = await request(app.getHttpServer())
      .post("/api/auth/two-factor/enable")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", firstCookie)
      .send({ password, method: "totp" });
    expect(enabled.status).toBe(200);
    const secret = new URL(enabled.body.totpURI as string).searchParams.get("secret")!;
    const verified = await request(app.getHttpServer())
      .post("/api/auth/two-factor/verify-totp")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", firstCookie)
      .send({ code: await createOTP(base32.decode(secret)).totp(), trustDevice: false });
    expect(verified.status).toBe(200);
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", cookieHeader(verified))).status).toBe(200);
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", firstCookie)).status).toBe(401);
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", secondCookie)).status).toBe(401);
    const user = await prisma.authUser.findUniqueOrThrow({ where: { email } });
    const sessions = await prisma.authSession.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.mfaVerified).toBe(true);

    // Optional enrollment still protects the session once the user opted in.
    await prisma.userAccount.update({ where: { authUserId: user.id }, data: { mfaRequired: false } });
    await prisma.authSession.update({ where: { id: sessions[0]!.id }, data: { mfaVerified: false } });
    const unverifiedOptional = await request(app.getHttpServer()).get("/api/me").set("Cookie", cookieHeader(verified));
    expect(unverifiedOptional.status).toBe(403);
    expect(unverifiedOptional.body.code).toBe("MFA_VERIFICATION_REQUIRED");
    await prisma.authSession.update({ where: { id: sessions[0]!.id }, data: { mfaVerified: true } });
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", cookieHeader(verified))).status).toBe(200);
  });

  it("removes a case from assignment-based lists when operational read permission is withdrawn", async () => {
    const actor = fixtures.actors.professional!;
    const cookie = await authenticatedCookie(actor);
    const assignment = await prisma.caseAssignment.findFirstOrThrow({
      where: { accountId: actor.accountId, caseId: fixtures.cases.caseA },
    });
    try {
      await prisma.caseAssignment.update({ where: { id: assignment.id }, data: { allowedActions: [] } });
      const empty = await request(app.getHttpServer()).get("/api/cases").set("Cookie", cookie);
      expect(empty.status).toBe(200);
      expect(empty.body.map((item: { id: string }) => item.id)).not.toContain(fixtures.cases.caseA);
      expect(
        (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/overview`).set("Cookie", cookie)).status,
      ).toBe(404);

      await prisma.caseAssignment.update({
        where: { id: assignment.id }, data: { allowedActions: ["CASE_CLINICAL_READ"] },
      });
      const stillScoped = await request(app.getHttpServer()).get("/api/cases").set("Cookie", cookie);
      expect(stillScoped.status).toBe(200);
      expect(stillScoped.body.map((item: { id: string }) => item.id)).not.toContain(fixtures.cases.caseA);
      expect(
        (await request(app.getHttpServer()).get(`/api/cases/${fixtures.cases.caseA}/clinical`).set("Cookie", cookie)).status,
      ).toBe(200);
    } finally {
      await prisma.caseAssignment.update({
        where: { id: assignment.id }, data: { allowedActions: assignment.allowedActions },
      });
    }
  });

  it("rejects simple cookie mutations from a foreign or absent origin before changing the account", async () => {
    const adminCookie = await authenticatedCookie(fixtures.actors.operationsAdmin!);
    for (const origin of ["http://localhost:3999", undefined]) {
      const mutation = request(app.getHttpServer())
        .post(`/api/accounts/${fixtures.actors.support!.accountId}/disable`)
        .set("Cookie", adminCookie)
        .type("form");
      if (origin) mutation.set("Origin", origin);
      const response = await mutation.send("");
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("REQUEST_ORIGIN_NOT_ALLOWED");
      expect((await prisma.userAccount.findUniqueOrThrow({ where: { id: fixtures.actors.support!.accountId } })).status)
        .toBe("ACTIVE");
    }
  });

  it("deactivates an account and invalidates its active sessions", async () => {
    const supportCookie = await authenticatedCookie(fixtures.actors.support!);
    const adminCookie = await authenticatedCookie(fixtures.actors.operationsAdmin!);
    const response = await request(app.getHttpServer())
      .post(`/api/accounts/${fixtures.actors.support!.accountId}/disable`)
      .set("Origin", "http://localhost:3000")
      .set("Cookie", adminCookie)
      .send({});
    expect(response.status).toBe(201);
    expect((await request(app.getHttpServer()).get("/api/me").set("Cookie", supportCookie)).status).toBe(401);
    await prisma.userAccount.update({
      where: { id: fixtures.actors.support!.accountId },
      data: { status: "ACTIVE", disabledAt: null },
    });
  });

  it("stores useful denials without credentials or case content", async () => {
    const denials = await prisma.auditEvent.findMany({ where: { decision: "DENIED" } });
    expect(denials.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(denials, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
    expect(serialized).not.toMatch(/password|token|authorization|cookie|diagnosis|narrative/i);
    expect(denials.some((event) => event.reasonCode === "NO_APPLICABLE_SCOPE")).toBe(true);
  });

  it("rejects ordinary updates and deletes of audit events", async () => {
    const event = await prisma.auditEvent.findFirstOrThrow({ orderBy: { id: "asc" } });
    await expect(
      prisma.auditEvent.update({ where: { id: event.id }, data: { reasonCode: "MUTATION_ATTEMPT" } }),
    ).rejects.toThrow(/append-only/i);
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/i);
  });
});
