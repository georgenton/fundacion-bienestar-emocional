import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { caseActions } from "@fbe/access-policy";
import { prisma } from "@fbe/database";
import { dispatchReminders } from "@fbe/worker";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAuthPool, getEnrollmentAuth } from "../src/auth/auth.js";
import { createApp } from "../src/main.js";

type Fixture = { email: string; password: string; accountId: string; personId: string; totpSecret?: string };
const origin = "http://localhost:3000";
const minute = 60_000;
const auth: Record<string, string> = {};
let fixtures: Record<string, Fixture>;
let patient: Fixture;
let app: INestApplication;
let instant: Date;

function cookie(response: request.Response) {
  return Array.from(response.headers["set-cookie"] ?? [], (value: string) => value.split(";", 1)[0]).join("; ");
}
async function signIn(actor: Fixture) {
  const api = request(app.getHttpServer());
  const signed = await api.post("/api/auth/sign-in/email").set("Origin", origin)
    .send({ email: actor.email, password: actor.password });
  expect(signed.status).toBe(200);
  if (!actor.totpSecret) return cookie(signed);
  const code = await createOTP(base32.decode(actor.totpSecret)).totp();
  const verified = await api.post("/api/auth/two-factor/verify-totp").set("Origin", origin)
    .set("Cookie", cookie(signed)).send({ code, trustDevice: false });
  expect(verified.status).toBe(200);
  return cookie(verified);
}
function call(actor: string, path: string, body?: object) {
  const api = request(app.getHttpServer());
  return (body ? api.post(`/api/${path}`).send(body) : api.get(`/api/${path}`))
    .set("Origin", origin).set("Cookie", auth[actor]!);
}
function ok(response: request.Response, status = 201) {
  expect(response.status, response.body?.code).toBe(status);
  return response.body;
}
const shift = (minutes: number) => new Date(instant.getTime() + minutes * minute);
const link = () => {
  const letters = (count: number) => [...randomBytes(count)].map(value => String.fromCharCode(97 + value % 26)).join("");
  return `https://meet.google.com/${letters(3)}-${letters(4)}-${letters(3)}`;
};

async function booking(minutes: number, professional = "professionalB") {
  const professionalId = fixtures[professional]!.accountId;
  const service = await prisma.serviceDefinition.create({ data: {
    name: "Consulta ficticia de regresión del portal", durationMinutes: 45, marginMinutes: 0, modalities: ["ONLINE"],
  } });
  const tariff = await prisma.serviceTariff.create({ data: {
    serviceId: service.id, currency: "USD", amountMinor: 4000, startsAt: shift(-10000),
  } });
  const care = await prisma.careCase.create({ data: {
    referenceCode: `SYN-PORTAL-${randomUUID()}`, serviceId: service.id, modality: "ONLINE",
    participants: { create: { personId: patient.personId, kind: "PATIENT", portalAccess: true, startsAt: shift(-10000) } },
    assignments: { create: { accountId: professionalId, function: "TREATING_PROFESSIONAL",
      startsAt: shift(-10000), allowedActions: [caseActions.appointmentRead] } },
  } });
  return prisma.appointment.create({ data: {
    caseId: care.id, professionalId, serviceId: service.id, serviceName: service.name, tariffId: tariff.id,
    createdByAccountId: fixtures.reception!.accountId, durationMinutes: 45, marginMinutes: 0,
    currency: "USD", amountMinor: 4000, modality: "ONLINE", startsAt: shift(minutes), endsAt: shift(minutes + 45),
    occupiedUntil: shift(minutes + 45), status: "CONFIRMED", attendance: "UNRECORDED",
  } });
}

beforeAll(async () => {
  fixtures = JSON.parse(await readFile(resolve(process.cwd(), "../../.local/demo-credentials.json"), "utf8")).actors;
  app = await createApp();
  const email = `portal-${randomUUID()}@example.test`;
  const password = `Syn!${randomBytes(18).toString("base64url")}`;
  const signup = await getEnrollmentAuth().api.signUpEmail({ body: { name: "Paciente ficticio del portal", email, password } });
  const person = await prisma.person.create({ data: { displayName: "Paciente ficticio del portal", contactEmail: email, synthetic: true } });
  const role = await prisma.role.findUniqueOrThrow({ where: { code: "PATIENT" } });
  const account = await prisma.userAccount.create({ data: { authUserId: signup.user.id, personId: person.id,
    status: "ACTIVE", mfaRequired: false, roles: { create: { roleId: role.id } } } });
  patient = { email, password, accountId: account.id, personId: person.id };
  auth.patient = await signIn(patient);
  for (const key of ["reception", "professional", "professionalB", "clinicalPatient"]) auth[key] = await signIn(fixtures[key]!);
  const [clock] = await prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  instant = new Date(Math.floor(clock!.now.getTime() / minute) * minute);
});

afterAll(async () => {
  await app?.close();
  await closeAuthPool();
  await prisma.$disconnect();
});

describe("Regresiones del portal sobre PostgreSQL", () => {
  it("reactiva un aviso omitido al consentir de nuevo, conserva intentos y no duplica una entrega", async () => {
    const appointment = await booking(130);
    ok(await call("patient", "portal/preferences", { enabled: true }));
    ok(await call("patient", "portal/preferences", { enabled: false }));
    await dispatchReminders();
    const omitted = await prisma.reminderJob.findFirstOrThrow({ where: { appointmentId: appointment.id, accountId: patient.accountId } });
    expect(omitted.state).toBe("SKIPPED");
    expect(omitted.attemptedAt).not.toBeNull();
    ok(await call("patient", "portal/preferences", { enabled: true }));
    const restored = await prisma.reminderJob.findUniqueOrThrow({ where: { id: omitted.id } });
    expect(restored).toMatchObject({ state: "READY", attemptedAt: omitted.attemptedAt });
    ok(await call("patient", "portal/preferences", { enabled: true }));
    await Promise.all([dispatchReminders(), dispatchReminders()]);
    const delivered = await prisma.reminderJob.findUniqueOrThrow({ where: { id: omitted.id }, include: { delivery: true } });
    expect(delivered.state).toBe("DELIVERED");
    expect(delivered.delivery).not.toBeNull();
    ok(await call("patient", "portal/preferences", { enabled: false }));
    ok(await call("patient", "portal/preferences", { enabled: true }));
    await dispatchReminders();
    expect(await prisma.reminderJob.findUniqueOrThrow({ where: { id: omitted.id }, include: { delivery: true } })).toEqual(delivered);
    expect(await prisma.reminderJob.count({ where: { appointmentId: appointment.id, accountId: patient.accountId } })).toBe(1);

    const revoked = await booking(260);
    const cancelled = await booking(390);
    ok(await call("patient", "portal/preferences", { enabled: true }));
    await prisma.caseParticipant.updateMany({ where: { caseId: revoked.caseId, personId: patient.personId }, data: { portalAccess: false } });
    ok(await call("reception", `agenda/appointments/${cancelled.id}/cancel`, { version: cancelled.version,
      party: "ADMINISTRATIVE", reason: "Cancelación ficticia de regresión", requestId: randomUUID() }));
    await dispatchReminders();
    ok(await call("patient", "portal/preferences", { enabled: true }));
    await dispatchReminders();
    const denied = await prisma.reminderJob.findMany({ where: { appointmentId: { in: [revoked.id, cancelled.id] }, accountId: patient.accountId },
      include: { delivery: true } });
    expect(denied).toHaveLength(2);
    expect(denied.every(job => job.state === "SKIPPED" && job.delivery === null)).toBe(true);
  });

  it("conserva el acceso de video al registrar asistencia y mantiene las denegaciones vigentes", async () => {
    const appointment = await booking(-5);
    const path = `portal/video/${appointment.id}`;
    const url = link();
    ok(await call("professionalB", path, { url, safetyChecked: true }));
    const originalMeeting = await prisma.videoMeeting.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    expect(ok(await call("patient", `${path}/join`, {})).url).toBe(url);
    const attended = ok(await call("reception", `agenda/appointments/${appointment.id}/attendance`, {
      version: appointment.version, attendance: "ATTENDED", requestId: randomUUID(),
    }));
    expect(attended).toMatchObject({ status: "CONFIRMED", attendance: "ATTENDED", version: appointment.version + 1,
      startsAt: appointment.startsAt.toISOString(), professionalId: appointment.professionalId });
    expect(ok(await call("professionalB", path), 200)).toMatchObject({ available: true, externalPending: false, canManage: true });
    expect(ok(await call("patient", `${path}/join`, {})).url).toBe(url);
    expect(ok(await call("professionalB", `${path}/join`, {})).url).toBe(url);
    expect((await call("professionalB", `${path}/external-confirmation`, { observed: true })).status).toBe(409);
    ok(await call("professionalB", path, { url, safetyChecked: true }));
    expect(await prisma.videoMeeting.findUniqueOrThrow({ where: { appointmentId: appointment.id } })).toEqual(originalMeeting);
    expect((await call("clinicalPatient", `${path}/join`, {})).status).toBe(404);
    await prisma.caseAssignment.updateMany({ where: { caseId: appointment.caseId, accountId: appointment.professionalId },
      data: { revokedAt: new Date() } });
    expect(ok(await call("professionalB", path), 200)).toMatchObject({ available: false, externalPending: false, canManage: false });
    expect((await call("professionalB", `${path}/join`, {})).status).toBe(404);
    await prisma.caseParticipant.updateMany({ where: { caseId: appointment.caseId, personId: patient.personId }, data: { portalAccess: false } });
    expect((await call("patient", `${path}/join`, {})).status).toBe(404);

    const absent = await booking(-5, "professional");
    const absentPath = `portal/video/${absent.id}`;
    ok(await call("professional", absentPath, { url: link(), safetyChecked: true }));
    ok(await call("reception", `agenda/appointments/${absent.id}/attendance`, {
      version: absent.version, attendance: "NO_SHOW", requestId: randomUUID(),
    }));
    expect((await call("patient", `${absentPath}/join`, {})).status).toBe(404);
    expect(ok(await call("professional", absentPath), 200)).toMatchObject({ available: false, externalPending: true });
    ok(await call("professional", `${absentPath}/external-confirmation`, { observed: true }));
    const closed = await prisma.videoMeeting.findUniqueOrThrow({ where: { appointmentId: absent.id } });
    ok(await call("professional", `${absentPath}/external-confirmation`, { observed: true }));
    expect(await prisma.videoMeeting.findUniqueOrThrow({ where: { appointmentId: absent.id } })).toEqual(closed);
    expect(ok(await call("professional", absentPath), 200)).toMatchObject({ available: false, externalPending: false,
      externalConfirmedAt: closed.externalClosedAt!.toISOString() });
  });
});
