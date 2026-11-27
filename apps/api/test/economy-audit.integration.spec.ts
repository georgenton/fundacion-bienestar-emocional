import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { prisma } from "@fbe/database";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAuthPool } from "../src/auth/auth.js";
import { createApp } from "../src/main.js";

type Fixture = { email: string; password: string; accountId: string; personId: string; totpSecret?: string };
const origin = "http://localhost:3000";
const sessions: Record<string, string> = {};
let fixtures: Record<string, Fixture>;
let app: INestApplication;

function cookie(response: request.Response) {
  return Array.from(response.headers["set-cookie"] ?? [], (item: string) => item.split(";", 1)[0]).join("; ");
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

function call(actor: string, body?: object) {
  const api = request(app.getHttpServer());
  return (body ? api.post("/api/economy/commands").send(body) : api.get("/api/economy"))
    .set("Origin", origin).set("Cookie", sessions[actor]!);
}

beforeAll(async () => {
  fixtures = JSON.parse(await readFile(resolve(process.cwd(), "../../.local/demo-credentials.json"), "utf8")).actors;
  app = await createApp();
  for (const actor of ["finance", "reception", "clinicalSupport", "clinicalPatient"]) {
    sessions[actor] = await signIn(fixtures[actor]!);
  }
});

afterAll(async () => {
  await app?.close();
  await closeAuthPool();
  await prisma.$disconnect();
});

describe("Auditoría de acceso al libro económico", () => {
  it("registra la lectura permitida sin copiar la respuesta financiera al evento", async () => {
    const before = await prisma.auditEvent.findMany({
      where: { actorAccountId: fixtures.finance!.accountId, action: "FINANCE_OVERVIEW" }, select: { id: true },
    });
    const response = await call("finance");
    expect(response.status).toBe(200);
    const events = await prisma.auditEvent.findMany({ where: {
      actorAccountId: fixtures.finance!.accountId, action: "FINANCE_OVERVIEW",
      id: { notIn: before.map(event => event.id) },
    } });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event).toMatchObject({ resourceType: "FinancialOverview", resourceId: null, decision: "ALLOWED" });
      expect(event.context).toBeNull();
    }
  });

  it("registra una lectura denegada al soporte sin revelar el libro", async () => {
    const before = await prisma.auditEvent.findMany({
      where: { actorAccountId: fixtures.clinicalSupport!.accountId, action: "FINANCE_OVERVIEW" }, select: { id: true },
    });
    const response = await call("clinicalSupport");
    expect(response.status).toBe(404);
    const events = await prisma.auditEvent.findMany({ where: {
      actorAccountId: fixtures.clinicalSupport!.accountId, action: "FINANCE_OVERVIEW",
      id: { notIn: before.map(event => event.id) },
    } });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event).toMatchObject({ resourceType: "FinancialOverview", resourceId: null, decision: "DENIED" });
      expect(event.context).toBeNull();
    }
  });

  it("conserva la denegación de capacidad de un comando después del rollback", async () => {
    const requestId = randomUUID();
    const response = await call("reception", {
      action: "VERIFY", requestId, receiptId: randomUUID(), confirmed: true,
    });
    expect(response.status).toBe(403);
    const events = await prisma.auditEvent.findMany({ where: {
      actorAccountId: fixtures.reception!.accountId, action: "FINANCE_VERIFY", resourceId: requestId,
    } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ resourceType: "FinanceCommand", decision: "DENIED", context: null });
    expect(await prisma.financeCommand.findUnique({
      where: { actorId_key: { actorId: fixtures.reception!.accountId, key: requestId } },
    })).toBeNull();
  });

  it("registra la denegación por ámbito del paciente sin guardar referencia ni importe", async () => {
    const requestId = randomUUID();
    const reference = `SYN-AUDIT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const reason = "Motivo administrativo ficticio que no debe copiarse a auditoría.";
    const narrative = "Texto clínico ficticio descartado por este comando financiero.";
    const response = await call("clinicalPatient", {
      action: "DECLARE", requestId, obligationId: randomUUID(), kind: "PAYMENT",
      reference, amountMinor: 12345, currency: "USD", reason, narrative,
    });
    expect(response.status).toBe(404);
    const events = await prisma.auditEvent.findMany({ where: {
      actorAccountId: fixtures.clinicalPatient!.accountId, action: "FINANCE_DECLARE", resourceId: requestId,
    } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ resourceType: "FinanceCommand", decision: "DENIED", context: null });
    const serialized = JSON.stringify(events, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value);
    expect(serialized).not.toContain(reference);
    expect(serialized).not.toContain(reason);
    expect(serialized).not.toContain(narrative);
    expect(serialized).not.toContain('"amountMinor"');
    expect(await prisma.moneyReceipt.count({ where: { reference } })).toBe(0);
    expect(await prisma.financeCommand.findUnique({
      where: { actorId_key: { actorId: fixtures.clinicalPatient!.accountId, key: requestId } },
    })).toBeNull();
  });
});
