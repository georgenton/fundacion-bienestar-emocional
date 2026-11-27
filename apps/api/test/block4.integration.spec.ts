import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { caseActions } from "@fbe/access-policy";
import { prisma } from "@fbe/database";
import { dispatchReminders } from "@fbe/worker";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAuthPool } from "../src/auth/auth.js";
import { createApp } from "../src/main.js";

type Fixture = { email: string; password: string; accountId: string; personId: string; totpSecret?: string };
const origin = "http://localhost:3000";
const marker = randomUUID().slice(0, 8).toUpperCase();
const auth: Record<string, string> = {};
const file = Buffer.from("Comprobante privado ficticio del bloque 4.\n");
const minute = 60_000;
let fixtures: Record<string, Fixture>;
let app: INestApplication;
let dir: string;
let instant: Date;

function cookie(response: request.Response) {
  return Array.from(response.headers["set-cookie"] ?? [], (item: string) => item.split(";", 1)[0]).join("; ");
}
async function signIn(actor: Fixture) {
  const http = request(app.getHttpServer());
  const signed = await http.post("/api/auth/sign-in/email").set("Origin", origin)
    .send({ email: actor.email, password: actor.password });
  expect(signed.status).toBe(200);
  if (!actor.totpSecret) return cookie(signed);
  const code = await createOTP(base32.decode(actor.totpSecret)).totp();
  const verified = await http.post("/api/auth/two-factor/verify-totp").set("Origin", origin)
    .set("Cookie", cookie(signed)).send({ code, trustDevice: false });
  expect(verified.status).toBe(200);
  return cookie(verified);
}
function call(actor: string, path: string, body?: object) {
  const api = request(app.getHttpServer());
  const route = `/api/${path}`;
  return (body ? api.post(route).send(body) : api.get(route)).set("Origin", origin).set("Cookie", auth[actor]!);
}
function cmd(actor: string, action: string, fields: object, requestId = randomUUID()) {
  return call(actor, "economy/commands", { action, ...fields, requestId });
}
function ok(result: request.Response, status = 201) {
  expect(result.status, result.body?.code).toBe(status);
  return result.body;
}
const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const shifted = (minutes: number) => new Date(instant.getTime() + minutes * minute);

async function booking(suffix: string, minutes: number, attended = false) {
  const professionalId = fixtures.professional!.accountId;
  const service = await prisma.serviceDefinition.create({
    data: { name: `Consulta sintética ${marker}-${suffix}`, durationMinutes: 45, marginMinutes: 0, modalities: ["ONLINE"] },
  });
  const tariff = await prisma.serviceTariff.create({
    data: { serviceId: service.id, ...usd(4000), startsAt: shifted(-10000) },
  });
  const care = await prisma.careCase.create({ data: {
    referenceCode: `SYN-ECON-${marker}-${suffix}`, serviceId: service.id, modality: "ONLINE",
    participants: { create: { personId: fixtures.clinicalPatient!.personId, kind: "PATIENT", portalAccess: true, startsAt: shifted(-10000) } },
    assignments: { create: { accountId: professionalId, function: "TREATING_PROFESSIONAL",
      allowedActions: [caseActions.appointmentRead], startsAt: shifted(-10000) } },
  } });
  await prisma.serviceProfessional.create({ data: { professionalId, serviceId: service.id, enabled: true } });
  return prisma.appointment.create({ data: {
    caseId: care.id, professionalId, serviceId: service.id, serviceName: service.name, tariffId: tariff.id,
    createdByAccountId: fixtures.reception!.accountId, durationMinutes: 45, marginMinutes: 0,
    ...usd(4000), modality: "ONLINE", startsAt: shifted(minutes), endsAt: shifted(minutes + 45),
    occupiedUntil: shifted(minutes + 45), status: "CONFIRMED", attendance: attended ? "ATTENDED" : "UNRECORDED",
  } });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fbe-economy-files-"));
  process.env.FBE_PRIVATE_ATTACHMENTS_DIR = dir;
  fixtures = JSON.parse(await readFile(resolve(process.cwd(), "../../.local/demo-credentials.json"), "utf8")).actors;
  app = await createApp();
  const [clock] = await prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  instant = new Date(Math.floor(clock!.now.getTime() / (5 * minute)) * 5 * minute);
  for (const actor of ["finance", "reception", "professional", "professionalB", "clinicalPatient", "clinicalSupport"]) {
    auth[actor] = await signIn(fixtures[actor]!);
  }
});
afterAll(async () => {
  await app?.close();
  await closeAuthPool();
  await prisma.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("Finanzas y portal sintéticos con PostgreSQL", () => {
  it("separa evidencia, verificación, parcialidades, solidaridad, donación y pagador", async () => {
    const first = await booking("A", -3980);
    const second = await booking("B", -3880);
    const { id: a } = ok(await cmd("reception", "OBLIGATION", { appointmentId: first.id }));
    const { id: b } = ok(await cmd("reception", "OBLIGATION", { appointmentId: second.id }));
    const declare = { kind: "PAYMENT", obligationId: a, reference: `SYN-${marker}-FIRST`, ...usd(2500) };
    expect((await cmd("clinicalPatient", "DECLARE", { ...declare, currency: "EUR" })).status).toBe(400);
    expect((await cmd("clinicalPatient", "DECLARE", { ...declare, amountMinor: 25.5 })).status).toBe(400);
    expect((await cmd("clinicalPatient", "DECLARE", { ...declare, amountMinor: 100000001 })).status).toBe(400);
    const key = randomUUID();
    const { id: receiptId } = ok(await cmd("clinicalPatient", "DECLARE", declare, key));
    expect(ok(await cmd("clinicalPatient", "DECLARE", declare, key)).id).toBe(receiptId);
    expect((await cmd("clinicalPatient", "DECLARE", { ...declare, ...usd(2600) }, key)).status).toBe(409);

    const evidencePath = `economy/receipts/${receiptId}/evidence`;
    const upload = { name: "pago.txt", title: "Comprobante ficticio", mediaType: "text/plain",
      data: file.toString("base64"), requestId: randomUUID() };
    const { id: fileId } = ok(await call("clinicalPatient", evidencePath, upload));
    expect(ok(await call("clinicalPatient", evidencePath, upload)).id).toBe(fileId);
    const download = await call("finance", `economy/evidence/${fileId}`);
    expect(download.status).toBe(200);
    expect(download.body).toEqual(file);
    expect(download.headers["cache-control"]).toContain("no-store");
    expect((await call("professional", `economy/evidence/${fileId}`)).status).toBe(404);
    expect((await call("clinicalSupport", "economy")).status).toBe(404);
    expect((await call("finance", `clinical/cases/${first.caseId}`)).status).toBe(404);

    const apply = { receiptId, obligationId: a, ...usd(2500) };
    expect((await cmd("finance", "APPLY", apply)).status).toBe(409);
    expect((await cmd("reception", "VERIFY", { receiptId, confirmed: true })).status).toBe(403);
    ok(await cmd("finance", "VERIFY", { receiptId, confirmed: true }));
    const concurrent = await Promise.all([cmd("finance", "APPLY", apply), cmd("finance", "APPLY", apply)]);
    expect(concurrent.map(row => row.status).sort()).toEqual([201, 409]);
    const current = ok(await call("clinicalPatient", "economy"), 200);
    expect(current.obligations.find((row: { id: string }) => row.id === a)).toMatchObject({ dueMinor: 1500, appliedMinor: 2500 });

    const payer = await prisma.person.create({ data: { displayName: "Pagador sintético sin cuenta" } });
    const thirdParty = { ...declare, payerId: payer.id, reference: `SYN-${marker}-THIRD`, ...usd(2000) };
    expect((await cmd("clinicalPatient", "DECLARE", thirdParty)).status).toBe(404);
    const secondReceipt = ok(await cmd("reception", "DECLARE", thirdParty)).id;
    ok(await cmd("finance", "VERIFY", { receiptId: secondReceipt, confirmed: true }));
    const split = { receiptId: secondReceipt, obligationId: a, ...usd(1500) };
    const splitKey = randomUUID();
    const same = await Promise.all([cmd("finance", "APPLY", split, splitKey), cmd("finance", "APPLY", split, splitKey)]);
    expect(ok(same[0]!).id).toBe(ok(same[1]!).id);
    ok(await cmd("finance", "APPLY", { receiptId: secondReceipt, obligationId: b, ...usd(500) }));
    const award = ok(await cmd("reception", "SOLIDARITY", {
      obligationId: b, kind: "SCHOLARSHIP", reason: "Beca de simulación", ...usd(3500),
    })).id;
    expect((await cmd("reception", "SOLIDARITY_APPROVE", { awardId: award })).status).toBe(403);
    ok(await cmd("finance", "SOLIDARITY_APPROVE", { awardId: award }));
    const donation = ok(await cmd("reception", "DECLARE", { kind: "DONATION", payerId: payer.id,
      reference: `SYN-${marker}-DONATION`, ...usd(1200) })).id;
    ok(await cmd("finance", "VERIFY", { receiptId: donation, confirmed: true }));
    expect((await cmd("finance", "APPLY", { receiptId: donation, obligationId: b, ...usd(1) })).status).toBe(409);
    expect(await prisma.userAccount.count({ where: { personId: payer.id } })).toBe(0);
    const final = ok(await call("clinicalPatient", "economy"), 200);
    expect(final.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: a, dueMinor: 0, appliedMinor: 4000 }),
      expect.objectContaining({ id: b, dueMinor: 0, solidarityMinor: 3500, appliedMinor: 500 }),
    ]));
    expect(final.receipts.some((row: { id: string }) => row.id === secondReceipt || row.id === donation)).toBe(false);
  });

  it("reserva devoluciones concurrentes y conserva la regla de una liquidación cerrada", async () => {
    const attended = await booking("ATTENDED", -3730, true);
    const { id: obligationId } = ok(await cmd("finance", "OBLIGATION", { appointmentId: attended.id }));
    const { id: receiptId } = ok(await cmd("clinicalPatient", "DECLARE", {
      kind: "PAYMENT", obligationId, reference: `SYN-${marker}-RETURN`, ...usd(2501),
    }));
    ok(await cmd("finance", "VERIFY", { receiptId, confirmed: true }));
    const { id: applicationId } = ok(await cmd("finance", "APPLY", { receiptId, obligationId, ...usd(2501) }));
    const professionalId = fixtures.professional!.accountId;
    const { id: settlementId } = ok(await cmd("finance", "SETTLEMENT", { professionalId, basisPoints: 5000 }));
    expect((await cmd("finance", "SETTLEMENT_EXECUTE", { settlementId })).status).toBe(409);
    ok(await cmd("finance", "SETTLEMENT_APPROVE", { settlementId }));
    ok(await cmd("finance", "SETTLEMENT_EXECUTE", { settlementId }));
    const view = ok(await call("professional", "economy"), 200);
    expect(view.settlements.find((row: { id: string }) => row.id === settlementId)).toMatchObject({ netMinor: 1251, stage: "SIMULATED" });
    expect(ok(await call("professionalB", "economy"), 200).settlements.some((row: { id: string }) => row.id === settlementId)).toBe(false);

    const terms = { receiptId, applicationId, reason: "Devolución simulada de prueba", ...usd(2001) };
    const concurrent = await Promise.all([cmd("finance", "REFUND", terms), cmd("finance", "REFUND", terms)]);
    expect(concurrent.map(row => row.status).sort()).toEqual([201, 409]);
    ok(await cmd("finance", "REFUND_REJECT", { refundId: concurrent.find(row => row.status === 201)!.body.id }));
    const { id: refundId } = ok(await cmd("finance", "REFUND", terms));
    ok(await cmd("finance", "REFUND_APPROVE", { refundId }));
    ok(await cmd("finance", "REFUND_EXECUTE", { refundId }));
    const { id: adjustment } = ok(await cmd("finance", "SETTLEMENT", { professionalId, basisPoints: 7000 }));
    expect(await prisma.settlementLine.findFirst({ where: { settlementId: adjustment, refundId } }))
      .toMatchObject({ grossMinor: -2001, netMinor: -1001 });
    expect((await cmd("finance", "SETTLEMENT", { professionalId, basisPoints: 7000 })).status).toBe(409);
    expect(await prisma.settlement.findUnique({ where: { id: settlementId } })).toMatchObject({ netMinor: 1251, basisPoints: 5000 });
    expect(ok(await call("clinicalPatient", "economy"), 200).obligations.find((row: { id: string }) => row.id === obligationId))
      .toMatchObject({ dueMinor: 3500, appliedMinor: 500 });
  });

  it("reprograma con saldo intacto y valida trabajos durables y retiro de video", async () => {
    const first = await booking("VIDEO", 90);
    const another = await booking("CANCEL", 220);
    const { id: obligationId } = ok(await cmd("reception", "OBLIGATION", { appointmentId: first.id }));
    const { id: receiptId } = ok(await cmd("clinicalPatient", "DECLARE", { obligationId, kind: "PAYMENT",
      reference: `SYN-${marker}-RESCHEDULE`, ...usd(2500) }));
    ok(await cmd("finance", "VERIFY", { receiptId, confirmed: true }));
    ok(await cmd("finance", "APPLY", { receiptId, obligationId, ...usd(2500) }));
    await prisma.serviceTariff.create({ data: { serviceId: first.serviceId, ...usd(5500), startsAt: shifted(-1) } });
    ok(await call("clinicalPatient", "portal/preferences", { enabled: true }));
    const video = `portal/video/${first.id}`;
    const url = "https://meet.google.com/fbe-test-vid";
    expect((await call("professional", video, { url: "https://example.test/meeting", safetyChecked: true })).status).toBe(400);
    expect((await call("professionalB", video, { url, safetyChecked: true })).status).toBe(404);
    ok(await call("professional", video, { url, safetyChecked: true }));
    expect((await prisma.videoMeeting.findUnique({ where: { appointmentId: first.id } }))!.encryptedLink).not.toContain(url);
    expect(JSON.stringify(ok(await call("clinicalPatient", video), 200))).not.toContain(url);
    expect(ok(await call("clinicalPatient", `${video}/join`, {})).url).toBe(url);
    expect((await call("clinicalSupport", `${video}/join`, {})).status).toBe(404);

    const day = new Date(shifted(150).getTime() - 300 * minute);
    await prisma.professionalHours.upsert({
      where: { professionalId_weekday: { professionalId: first.professionalId, weekday: day.getUTCDay() || 7 } },
      create: { professionalId: first.professionalId, weekday: day.getUTCDay() || 7, opensMinute: 0, closesMinute: 1440 },
      update: { opensMinute: 0, closesMinute: 1440 },
    });
    const { id: replacement } = ok(await call("reception", `agenda/appointments/${first.id}/reschedule`, {
      version: first.version, professionalId: first.professionalId, startsAt: shifted(150).toISOString(),
      reason: "Reprogramación de simulación", requestId: randomUUID(),
    }));
    expect(ok(await cmd("reception", "OBLIGATION", { appointmentId: replacement })).id).toBe(obligationId);
    expect(ok(await call("clinicalPatient", "economy"), 200).obligations.find((row: { id: string }) => row.id === obligationId))
      .toMatchObject({ amountMinor: 4000, dueMinor: 1500, appointmentId: replacement });
    expect((await call("clinicalPatient", `${video}/join`, {})).status).toBe(404);
    expect(ok(await call("professional", video), 200)).toMatchObject({ available: false, externalPending: true, externalConfirmedAt: null });
    expect((await call("professional", `portal/video/${replacement}`, { url, safetyChecked: true })).status).toBe(409);
    ok(await call("reception", `agenda/appointments/${another.id}/cancel`, {
      version: another.version, party: "ADMINISTRATIVE", reason: "Cancelación sintética", requestId: randomUUID(),
    }));
    const targetIds = [first.id, another.id, replacement];
    const pending = await prisma.reminderJob.findMany({ where: { appointmentId: { in: targetIds } } });
    expect(pending).toHaveLength(3);
    await Promise.all([dispatchReminders(), dispatchReminders()]);
    const rows = await prisma.reminderJob.findMany({ where: { appointmentId: { in: targetIds } }, include: { delivery: true } });
    expect(rows.filter(row => row.state === "SKIPPED" && row.attemptedAt && !row.delivery)).toHaveLength(2);
    expect(rows.find(row => row.appointmentId === replacement)).toMatchObject({ state: "DELIVERED", delivery: { jobId: expect.any(String) } });
    expect(ok(await call("clinicalPatient", "portal/inbox"), 200)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: rows.find(row => row.appointmentId === replacement)!.id, current: true }),
    ]));
    expect((await call("professionalB", "portal/inbox")).status).toBe(404);
    expect(await prisma.reminderDelivery.count({ where: { jobId: { in: rows.map(row => row.id) } } })).toBe(1);
    await prisma.caseParticipant.updateMany({ where: { caseId: first.caseId }, data: { portalAccess: false } });
    expect(ok(await call("clinicalPatient", "portal/inbox"), 200).some((row: { id: string }) =>
      row.id === rows.find(item => item.appointmentId === replacement)!.id)).toBe(false);
    expect((await call("clinicalPatient", `portal/video/${replacement}`)).status).toBe(404);
  });
});
