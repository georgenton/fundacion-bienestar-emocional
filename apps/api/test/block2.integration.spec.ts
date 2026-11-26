import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { prisma, type Appointment } from "@fbe/database";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAuthPool } from "../src/auth/auth.js";
import { takeTestInvitation } from "../src/invitations/invitation-delivery.js";
import { createApp } from "../src/main.js";

type Fixture = { email: string; password: string; accountId: string; totpSecret?: string };
const origin = "http://localhost:3000";
const generated = randomUUID().slice(0, 8);
const shared = `contacto-${generated}@example.test`;
const password = `Synthetic-only-${randomUUID()}`;
const minute = 60_000;
const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const at = (time: string) => new Date(`${date}T${time}:00-05:00`).toISOString();
const weekday = new Date(at("12:00")).getUTCDay() || 7;
const key = () => randomUUID();

let app: INestApplication;
let fixtures: Record<string, Fixture>;
let reception: string;
let admin: string;
let pro: Fixture;
let proB: Fixture;
let serviceId: string;
let personId: string;
let otherPersonId: string;
let caseId: string;
let caseB: string;
let patient: string;
let otherPatient: string;

const api = () => request(app.getHttpServer());
const cookies = (response: request.Response) => Array.from(response.headers["set-cookie"] ?? [],
  (value: string) => value.split(";", 1)[0]).join("; ");

async function signIn(email: string, password: string, totpSecret?: string) {
  const response = await api().post("/api/auth/sign-in/email").set("Origin", origin).send({ email, password });
  expect(response.status).toBe(200);
  if (!totpSecret) return cookies(response);
  expect(response.body.twoFactorRedirect).toBe(true);
  const code = await createOTP(base32.decode(totpSecret)).totp();
  const verified = await api().post("/api/auth/two-factor/verify-totp").set("Origin", origin)
    .set("Cookie", cookies(response)).send({ code, trustDevice: false });
  expect(verified.status).toBe(200);
  return cookies(verified);
}

function post(path: string, body: object, cookie = reception) {
  return api().post(`/api/${path}`).set("Origin", origin).set("Cookie", cookie).send(body);
}
function get(path: string, cookie = reception) {
  return api().get(`/api/${path}`).set("Cookie", cookie);
}
function activate(token: string, extra = {}) {
  return api().post("/api/invitations/activate").send({ token, password, ...extra });
}
function agenda(cookie = reception) {
  const query = new URLSearchParams({ start: at("00:00"), end: at("23:59") });
  return get(`agenda/appointments?${query}`, cookie);
}
function hold(time: string, requestId = key(), careCase = caseId, professional = pro) {
  return post("agenda/appointments/hold", {
    caseId: careCase, professionalId: professional.accountId, startsAt: at(time), requestId,
  });
}
function change(id: string, operation: string, data: object, requestId = key(), cookie = reception) {
  return post(`agenda/appointments/${id}/${operation}`, { ...data, requestId }, cookie);
}

function expectError(result: request.Response, status: number, code: string) {
  expect({ status: result.status, code: result.body.code }).toEqual({ status, code });
}

beforeAll(async () => {
  app = await createApp();
  ({ actors: fixtures } = JSON.parse(await readFile(resolve(process.cwd(), "../../.local/demo-credentials.json"), "utf8")));
  pro = fixtures.professional!;
  proB = fixtures.professionalB!;
  reception = await signIn(fixtures.reception!.email, fixtures.reception!.password, fixtures.reception!.totpSecret);
  admin = await signIn(fixtures.operationsAdmin!.email, fixtures.operationsAdmin!.password, fixtures.operationsAdmin!.totpSecret);
  const service = await post("agenda/catalog/services", {
    name: `Consulta sintética ${generated}`, durationMinutes: 50, marginMinutes: 10, enabled: true, modalities: ["IN_PERSON"],
  });
  expect(service.status).toBe(201);
  serviceId = service.body.id;
  for (const professional of [pro, proB]) {
    expect((await post("agenda/catalog/eligibility", { serviceId, professionalId: professional.accountId, enabled: true })).status).toBe(201);
    expect((await post("agenda/catalog/hours", {
      professionalId: professional.accountId, weekday, enabled: true, opensMinute: 480, closesMinute: 1200,
    })).status).toBe(201);
  }
  expect((await post("agenda/catalog/tariffs", { serviceId, currency: "USD", amountMinor: 2500 })).status).toBe(201);
});

afterAll(async () => {
  await app?.close();
  await closeAuthPool();
  await prisma.$disconnect();
});

describe("Personas y agenda con PostgreSQL", () => {
  it("registra dos personas con contacto compartido y abre un caso por persona", async () => {
    const [first, second] = await Promise.all([
      post("people", { displayName: "Persona Uno Sintética", contactEmail: shared }),
      post("people", { displayName: "Persona Dos Sintética", contactEmail: shared }),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    personId = first.body.id;
    otherPersonId = second.body.id;
    expect(personId).not.toBe(otherPersonId);
    expect(first.body.userAccount).toBeNull();
    expect(second.body.userAccount).toBeNull();
    const found = await get(`people?q=${encodeURIComponent(shared)}`);
    expect(found.body.map((item: { id: string }) => item.id)).toEqual([otherPersonId, personId]);

    const open = (personId: string, modality: string) => post("cases", { personId, serviceId, modality });
    expectError(await open(personId, "ONLINE"), 400, "SERVICE_MODALITY_DISABLED");
    const [newCase, another] = await Promise.all([open(personId, "IN_PERSON"), open(otherPersonId, "IN_PERSON")]);
    expect([newCase.status, another.status]).toEqual([201, 201]);
    caseId = newCase.body.id;
    caseB = another.body.id;
    expectError(await post(`cases/${caseId}/assignments`, { professionalId: fixtures.supervisor!.accountId }), 400, "PROFESSIONAL_NOT_ELIGIBLE");
    expect((await post(`cases/${caseId}/assignments`, { professionalId: pro.accountId })).status).toBe(201);
    expect((await post(`cases/${caseB}/assignments`, { professionalId: proB.accountId })).status).toBe(201);
    const detail = await get(`people/${personId}`);
    expect(detail.body.cases).toMatchObject([{ id: caseId, assignments: [{ account: { id: pro.accountId } }] }]);
  });

  it("vincula la misma persona y participación con token de uso único y deniega cambios de objetivo", async () => {
    const email = `acceso-${generated}@example.test`;
    const otherEmail = `acceso-otro-${generated}@example.test`;
    const participation = await prisma.caseParticipant.findFirstOrThrow({ where: { caseId, personId } });
    expectError(await post("invitations", { email, personId, roleCode: "PROFESSIONAL" }), 400, "PATIENT_ROLE_REQUIRED");
    expectError(await post("invitations", { email, displayName: "Sintético", roleCode: "OPERATIONS_ADMIN" }), 403, "CAPABILITY_REQUIRED");
    expect((await post("invitations", { email, personId })).status).toBe(201);
    const invite = takeTestInvitation(email)!;
    expectError(await activate(invite.token, { personId: otherPersonId }), 400, "ACTIVATION_INVALID");

    const competing = await Promise.all([activate(invite.token), activate(invite.token), activate(invite.token)]);
    expect(competing.map(result => result.status).sort()).toEqual([201, 400, 400]);
    expect((await prisma.userAccount.findUnique({ where: { personId } }))?.status).toBe("ACTIVE");
    expect((await prisma.caseParticipant.findFirstOrThrow({ where: { caseId, personId } })).id).toBe(participation.id);
    expect(await prisma.person.count({ where: { contactEmail: shared } })).toBe(2);

    expect((await post("invitations", { email: otherEmail, personId: otherPersonId })).status).toBe(201);
    const other = takeTestInvitation(otherEmail)!;
    expect((await activate(other.token)).status).toBe(201);
    patient = await signIn(email, password);
    otherPatient = await signIn(otherEmail, password);
    expect((await get("me", patient)).body.personId).toBe(personId);
    expect((await get("cases", patient)).body.map((item: { id: string }) => item.id)).toEqual([caseId]);
    expect((await get("cases", otherPatient)).body.map((item: { id: string }) => item.id)).toEqual([caseB]);
    expectError(await get(`cases/${caseB}/overview`, patient), 404, "CASE_NOT_AVAILABLE");
    expectError(await get(`people/${personId}`, patient), 403, "CAPABILITY_REQUIRED");
    expectError(await post("invitations", { email: `nuevo-${generated}@example.test`, personId }, reception), 409, "ACCOUNT_ALREADY_LINKED");
  });

  it("revierte el consumo cuando el objetivo archivado impide activar", async () => {
    const archived = await post("people", { displayName: "Persona Archivo Sintética" });
    expect(archived.status).toBe(201);
    const email = `archivo-${generated}@example.test`;
    expect((await post("invitations", { email, personId: archived.body.id })).status).toBe(201);
    const invite = takeTestInvitation(email)!;
    await prisma.person.update({ where: { id: archived.body.id }, data: { archivedAt: new Date() } });
    expectError(await activate(invite.token), 400, "ACTIVATION_INVALID");
    const tokenDigest = createHash("sha256").update(invite.token).digest("hex");
    expect((await prisma.accountInvitation.findUniqueOrThrow({ where: { tokenDigest } })).usedAt).toBeNull();
    expect(await prisma.authUser.findUnique({ where: { email } })).toBeNull();
  });

  it("serializa reservas concurrentes, protege el margen y confía en la restricción de base", async () => {
    expectError(await hold("08:00", key(), caseId, fixtures.supervisor!), 400, "PROFESSIONAL_NOT_ELIGIBLE");
    expectError(await hold("08:00", key(), caseId, proB), 400, "PROFESSIONAL_NOT_ASSIGNED");
    const requestId = key();
    const [sameA, sameB, rival] = await Promise.all([hold("09:00", requestId), hold("09:00", requestId), hold("09:00")]);
    const winner = [sameA, rival].find(item => item.status === 201)!;
    expect(winner).toBeDefined();
    expect(sameA.status).toBe(sameB.status);
    if (sameA.status === 201) expect(sameA.body.id).toBe(sameB.body.id);
    expect(sameA.status === 201 ? rival.status : sameA.status).toBe(409);
    expect(await prisma.appointment.count({ where: { caseId, startsAt: new Date(at("09:00")), status: "HELD" } })).toBe(1);
    expectError(await hold("09:20"), 409, "APPOINTMENT_CONFLICT");
    expectError(await hold("09:55"), 409, "APPOINTMENT_CONFLICT");
    const adjacent = await hold("10:00");
    expect(adjacent.status).toBe(201);
    const original = await prisma.appointment.findUniqueOrThrow({ where: { id: winner.body.id } });
    await expect(prisma.appointment.create({ data: {
      ...original, id: randomUUID(), startsAt: new Date(at("09:35")), endsAt: new Date(at("10:25")),
      occupiedUntil: new Date(at("10:35")),
    } })).rejects.toThrow(/exclusion constraint|constraint violated|23P01/i);

    const confirmation = key();
    expectError(await change(original.id, "confirm", { version: 1 }, key(), admin), 409, "HOLD_OWNER_REQUIRED");
    await post("agenda/catalog/services", { id: serviceId, name: original.serviceName, enabled: true,
      modalities: ["ONLINE"], durationMinutes: 50, marginMinutes: 10 });
    expectError(await change(original.id, "confirm", { version: 1 }, confirmation), 400, "SERVICE_MODALITY_DISABLED");
    await post("agenda/catalog/services", { id: serviceId, name: original.serviceName, enabled: true,
      modalities: ["IN_PERSON"], durationMinutes: 50, marginMinutes: 10 });
    const [confirmed, replay] = await Promise.all([
      change(original.id, "confirm", { version: 1 }, confirmation),
      change(original.id, "confirm", { version: 1 }, confirmation),
    ]);
    expect(confirmed.status).toBe(201);
    expect(replay.body).toEqual(confirmed.body);
    expectError(await change(original.id, "confirm", { version: 2 }, confirmation), 409, "REQUEST_ID_CONFLICT");

    await prisma.$executeRaw`UPDATE "Appointment" SET "holdExpiresAt" = clock_timestamp() - interval '1 second'
      WHERE id = ${adjacent.body.id}::uuid`;
    expectError(await change(adjacent.body.id, "confirm", { version: 1 }), 409, "HOLD_EXPIRED");
    expect((await agenda()).body.appointments.some((item: Appointment) => item.id === adjacent.body.id)).toBe(false);
    expect((await hold("10:00")).status).toBe(201);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: adjacent.body.id } })).status).toBe("EXPIRED");
  });

  it("conserva la cita al fallar, reprograma atómicamente e informa ausencias sin cancelar", async () => {
    const original = await prisma.appointment.findFirstOrThrow({ where: { caseId, status: "CONFIRMED" } });
    const absence = await post("agenda/catalog/absences", {
      professionalId: pro.accountId, startsAt: at("09:05"), endsAt: at("09:20"),
    });
    expect(absence.status).toBe(201);
    expect(absence.body.conflicts.map((item: { id: string }) => item.id)).toEqual([original.id]);
    expect((await get(`agenda/catalog/absences/${absence.body.id}/conflicts`)).body.conflicts).toHaveLength(1);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: original.id } })).status).toBe("CONFIRMED");
    const move = { version: original.version, professionalId: pro.accountId, reason: "Reprogramación sintética" };
    expectError(await change(original.id, "reschedule", { ...move, startsAt: at("10:20") }), 409, "APPOINTMENT_CONFLICT");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: original.id } })).version).toBe(original.version);
    expect(await prisma.appointment.count({ where: { previousId: original.id } })).toBe(0);

    expect((await post("agenda/catalog/services", { id: serviceId, name: "Consulta sintética editada",
      enabled: true, modalities: ["IN_PERSON"], durationMinutes: 30, marginMinutes: 5 })).status).toBe(201);
    expect((await post("agenda/catalog/tariffs", { serviceId, currency: "USD", amountMinor: 4100 })).status).toBe(201);
    const payload = { ...move, startsAt: at("11:00") };
    const token = key();
    const [newAppointment, replay] = await Promise.all([
      change(original.id, "reschedule", payload, token), change(original.id, "reschedule", payload, token),
    ]);
    expect(newAppointment.status).toBe(201);
    expect(replay.body).toEqual(newAppointment.body);
    expect(newAppointment.body).toMatchObject({
      previousId: original.id, serviceName: original.serviceName, durationMinutes: 50, marginMinutes: 10, amountMinor: 2500,
    });
    expect(await prisma.appointment.count({ where: { previousId: original.id, status: "CONFIRMED" } })).toBe(1);
    expectError(await change(original.id, "cancel", { version: original.version, party: "PATIENT", reason: "Motivo sintético" }), 409, "APPOINTMENT_STALE");
    const cancelled = await change(newAppointment.body.id, "cancel", {
      version: newAppointment.body.version, party: "PROFESSIONAL", reason: "Cancelación sintética",
    });
    expect(cancelled.body).toMatchObject({ status: "CANCELLED", cancellationParty: "PROFESSIONAL", attendance: "UNRECORDED" });
    const newTerms = await hold("13:00", key(), caseB, proB);
    expect(newTerms.body).toMatchObject({ status: "HELD", durationMinutes: 30, marginMinutes: 5, amountMinor: 4100 });
    expect((await change(newTerms.body.id, "confirm", { version: 1 })).status).toBe(201);
  });

  it("limita la agenda a identidad y asignación y registra asistencia sin cambiar cita ni tarifa", async () => {
    const clinical = await signIn(pro.email, pro.password, pro.totpSecret);
    const otherClinical = await signIn(proB.email, proB.password, proB.totpSecret);
    for (const [cookie, expected] of [[patient, caseId], [otherPatient, caseB], [clinical, caseId], [otherClinical, caseB]]) {
      const response = await agenda(cookie);
      expect(response.status).toBe(200);
      const visible = response.body.appointments as Appointment[];
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every(item => item.caseId === expected && item.status !== "HELD")).toBe(true);
    }
    expectError(await get(`cases/${caseB}/overview`, clinical), 404, "CASE_NOT_AVAILABLE");
    expectError(await get(`cases/${caseId}/overview`, otherClinical), 404, "CASE_NOT_AVAILABLE");
    expectError(await post("agenda/appointments/hold", {
      caseId, professionalId: pro.accountId, startsAt: at("16:00"), requestId: key(),
    }, patient), 403, "CAPABILITY_REQUIRED");

    const current = await prisma.appointment.findFirstOrThrow({ where: { caseId: caseB, status: "CONFIRMED" } });
    expectError(await change(current.id, "attendance", { version: current.version, attendance: "ATTENDED" }), 409, "APPOINTMENT_NOT_STARTED");
    for (const [index, attendance] of ["ATTENDED", "NO_SHOW"].entries()) {
      const startsAt = new Date(Date.now() - (index + 1) * 86_400_000);
      const endsAt = new Date(startsAt.getTime() + current.durationMinutes * minute);
      const past = await prisma.appointment.create({ data: {
        ...current, id: randomUUID(), startsAt, endsAt, occupiedUntil: new Date(endsAt.getTime() + current.marginMinutes * minute),
      } });
      const result = await change(past.id, "attendance", { version: past.version, attendance });
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({ status: "CONFIRMED", attendance, amountMinor: current.amountMinor, cancellationParty: null });
      expect(result.body).not.toHaveProperty("encounterStatus");
      expect(result.body).not.toHaveProperty("paymentStatus");
    }
    const cancelled = await change(current.id, "cancel", {
      version: current.version, party: "PATIENT", reason: "Cancelación sintética del paciente",
    });
    expect(cancelled.body).toMatchObject({ status: "CANCELLED", cancellationParty: "PATIENT", attendance: "UNRECORDED" });
  });
});
