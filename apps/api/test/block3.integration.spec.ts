import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
const marker = randomUUID();
const hours = 3_600_000;
const day = new Date(Date.now() - 5 * hours).toISOString().slice(0, 10);
const now = (shift = 0) => new Date(Date.now() + shift);
const who: Record<string, string> = {};
let fixtures: Record<string, Fixture>;
let app: INestApplication;
let dir: string;
let storage: string;
let caseId: string;
let appointmentId: string;
let treatmentGrant: string;
let consentId: string;
let encounterId: string;
let noteId: string;
let practiceId: string;

function api() { return request(app.getHttpServer()); }
function cookie(response: request.Response) {
  return Array.from(response.headers["set-cookie"] ?? [], (item: string) => item.split(";", 1)[0]).join("; ");
}
async function signIn(actor: Fixture) {
  const signed = await api().post("/api/auth/sign-in/email").set("Origin", origin)
    .send({ email: actor.email, password: actor.password });
  expect(signed.status).toBe(200);
  if (!actor.totpSecret) return cookie(signed);
  const code = await createOTP(base32.decode(actor.totpSecret)).totp();
  const verified = await api().post("/api/auth/two-factor/verify-totp").set("Origin", origin).set("Cookie", cookie(signed))
    .send({ code, trustDevice: false });
  expect(verified.status).toBe(200);
  return cookie(verified);
}
function post(path: string, actor: string, body: object) {
  return api().post(`/api/clinical/${path}`).set("Origin", origin).set("Cookie", who[actor]!).send(body);
}
function get(path: string, actor: string) {
  return api().get(`/api/clinical/${path}`).set("Cookie", who[actor]!);
}
function casePath(suffix = "") { return `cases/${caseId}${suffix ? `/${suffix}` : ""}`; }
function status(result: request.Response, code: number) {
  expect({ status: result.status, code: result.body?.code ?? null }).toEqual({
    status: code, code: code >= 400 ? result.body.code : null,
  });
  return result.body;
}
const bytes = Buffer.from("Documento privado ficticio de la verificación.\n");
const upload = { name: "prueba.txt", mediaType: "text/plain", title: "Documento ficticio", data: bytes.toString("base64") };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fbe-block3-integration-"));
  storage = join(dir, "objects");
  process.env.FBE_PRIVATE_ATTACHMENTS_DIR = storage;
  app = await createApp();
  ({ actors: fixtures } = JSON.parse(await readFile(resolve(process.cwd(), "../../.local/demo-credentials.json"), "utf8")));
  for (const name of ["clinicalCoordinator", "reception", "professional", "professionalB", "clinicalPatient", "intern", "clinicalSupervisor", "supervisorB", "clinicalSupport"]) {
    who[name] = await signIn(fixtures[name]!);
  }
  const professionalId = fixtures.professional!.accountId;
  const service = await prisma.serviceDefinition.create({
    data: { name: "Consulta Ficticia de Expediente", durationMinutes: 45, marginMinutes: 0, modalities: ["IN_PERSON"] },
  });
  const tariff = await prisma.serviceTariff.create({
    data: { serviceId: service.id, currency: "USD", amountMinor: 1900, startsAt: now(-24 * hours) },
  });
  const care = await prisma.careCase.create({ data: {
    referenceCode: `SYN-CLINICAL-${marker}`, serviceId: service.id, modality: "IN_PERSON",
    participants: { create: { personId: fixtures.clinicalPatient!.personId, kind: "PATIENT", portalAccess: true } },
  } });
  caseId = care.id;
  const startsAt = now(-72 * hours);
  const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
  const appointment = await prisma.appointment.create({ data: {
    caseId, professionalId, serviceId: service.id, serviceName: service.name, tariffId: tariff.id,
    createdByAccountId: fixtures.reception!.accountId, durationMinutes: 45, marginMinutes: 0,
    currency: "USD", amountMinor: 1900, modality: "IN_PERSON", startsAt, endsAt, occupiedUntil: endsAt,
    status: "CONFIRMED", attendance: "ATTENDED",
  } });
  appointmentId = appointment.id;
});

afterAll(async () => {
  await app?.close();
  await closeAuthPool();
  await prisma.$disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("Consentimientos y expediente en PostgreSQL", () => {
  it("separa asignación clínica, evidencia testificada e historial del paciente", async () => {
    status(await get(casePath(), "reception"), 404);
    status(await get(casePath(), "clinicalSupport"), 404);
    status(await get(casePath(), "professionalB"), 404);
    status(await get(casePath(), "clinicalCoordinator"), 404);
    const grant = { accountId: fixtures.professional!.accountId, function: "TREATING_PROFESSIONAL" };
    status(await post(casePath("grants"), "reception", grant), 403);
    treatmentGrant = status(await post(casePath("grants"), "clinicalCoordinator", grant), 201).id;
    status(await post(casePath("encounters"), "professional", { appointmentId }), 409);
    const original = status(await get(casePath("consents"), "clinicalPatient"), 200).templates.find((row: { purpose: string }) => row.purpose === "CARE");
    const staff = { templateId: original.id, confirmed: true, medium: "STAFF_WITNESSED" };
    status(await post(casePath("consents"), "clinicalPatient", staff), 404);
    const first = status(await post(casePath("consents"), "professional", staff), 201);
    expect(first).toMatchObject({ personId: fixtures.clinicalPatient!.personId, recordedById: fixtures.professional!.accountId,
      medium: "STAFF_WITNESSED" });
    const newer = status(await post("consent-templates", "clinicalCoordinator", { purpose: "CARE",
      body: "Segunda versión ficticia para la demostración." }), 201);
    const accept = { templateId: newer.id, confirmed: true, medium: "PATIENT_PORTAL" };
    status(await post(casePath("consents"), "professional", accept), 404);
    status(await post(casePath("consents"), "clinicalPatient", { ...accept, templateId: original.id }), 409);
    const second = status(await post(casePath("consents"), "clinicalPatient", accept), 201);
    expect(second).toMatchObject({ recordedById: fixtures.clinicalPatient!.accountId, medium: "PATIENT_PORTAL" });
    status(await post(casePath(`consents/${second.id}/withdraw`), "clinicalPatient", {}), 201);
    status(await post(casePath("encounters"), "professional", { appointmentId }), 409);
    const history = status(await get(casePath("consents"), "clinicalPatient"), 200).history;
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, template: expect.objectContaining({ body: original.body }) }),
      expect.objectContaining({ id: second.id, withdrawnById: fixtures.clinicalPatient!.accountId }),
    ]));
    consentId = status(await post(casePath("consents"), "clinicalPatient", accept), 201).id;
    const encounter = status(await post(casePath("encounters"), "professional", { appointmentId }), 201);
    encounterId = encounter.id;
    expect(encounter).toMatchObject({ caseId, appointmentId, status: "OPEN" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).attendance).toBe("ATTENDED");
  });

  it("rechaza una edición simultánea y conserva nota validada, adenda y autoría", async () => {
    const note = status(await post(casePath(`encounters/${encounterId}/notes`), "professional",
      { narrative: "Texto inicial de prueba." }), 201);
    noteId = note.id;
    const responses = await Promise.all([
      post(casePath(`notes/${note.id}`), "professional", { operation: "EDIT", version: 1, narrative: "Edición ficticia A." }),
      post(casePath(`notes/${note.id}`), "professional", { operation: "EDIT", version: 1, narrative: "Edición ficticia B." }),
    ]);
    expect(responses.map(item => item.status).sort()).toEqual([201, 409]);
    const validated = status(await post(casePath(`notes/${note.id}`), "professional", { operation: "VALIDATE", version: 2 }), 201);
    status(await post(casePath(`notes/${note.id}`), "professional", { operation: "EDIT", version: 3, narrative: "Texto reemplazado." }), 409);
    await expect(prisma.clinicalNote.update({ where: { id: note.id }, data: {
      narrative: "Escritura directa ficticia que debe fallar", version: 4,
    } })).rejects.toThrow();
    await expect(prisma.clinicalNote.delete({ where: { id: note.id } })).rejects.toThrow();
    const adenda = status(await post(casePath(`notes/${note.id}/addenda`), "professional", {
      reason: "Corrección sintética", narrative: "Adenda ficticia del ensayo.",
    }), 201);
    const reread = await prisma.clinicalNote.findUniqueOrThrow({ where: { id: note.id }, include: { addenda: true } });
    expect(reread).toMatchObject({ narrative: validated.narrative, version: 3, authorId: fixtures.professional!.accountId,
      addenda: [expect.objectContaining({ id: adenda.id, authorId: fixtures.professional!.accountId })] });
    status(await get(casePath(), "clinicalPatient"), 404);
  });
});

describe("Prácticas y documentos privados", () => {
  it("conserva revisiones y pendientes al cambiar supervisor, suspender y vencer la práctica", async () => {
    const practice = status(await post("practices", "clinicalCoordinator", {
      internId: fixtures.intern!.accountId, supervisorId: fixtures.clinicalSupervisor!.accountId,
      institution: "Institución enteramente ficticia", institutionalRef: "REF-SIMULACION",
      startsAt: now(-48 * hours).toISOString(), endsAt: now(48 * hours).toISOString(),
    }), 201);
    practiceId = practice.id;
    expect(practice.clinicalSimulation).toBe(false);
    const internGrant = { accountId: fixtures.intern!.accountId, function: "INTERN", practiceId };
    status(await post(casePath("grants"), "clinicalCoordinator", internGrant), 409);
    const change = { supervisorId: fixtures.clinicalSupervisor!.accountId, status: "ACTIVE", state: "ACTIVE",
      clinicalSimulation: true, reason: "Simulación institucional ficticia." };
    status(await post(`practices/${practiceId}`, "clinicalCoordinator", { ...change, version: 1 }), 201);
    for (const role of ["clinicalSupervisor", "supervisorB"]) {
      status(await post(casePath("grants"), "clinicalCoordinator", {
        accountId: fixtures[role]!.accountId, function: "SUPERVISOR",
      }), 201);
    }
    status(await post(casePath("grants"), "clinicalCoordinator", internGrant), 201);
    status(await get(casePath(), "intern"), 404);
    const template = status(await get(casePath("consents"), "clinicalPatient"), 200).templates
      .find((row: { purpose: string }) => row.purpose === "INTERN_PARTICIPATION");
    status(await post(casePath("consents"), "clinicalPatient", { templateId: template.id, confirmed: true, medium: "PATIENT_PORTAL" }), 201);

    const note = status(await post(casePath(`encounters/${encounterId}/notes`), "intern", {
      narrative: "Aporte originalmente escrito por el pasante ficticio.", authorFunction: "SUPERVISOR",
    }), 201);
    expect(note.authorFunction).toBe("INTERN");
    const notePath = casePath(`notes/${note.id}`);
    status(await post(notePath, "intern", { operation: "VALIDATE", version: 1 }), 404);
    status(await post(notePath, "intern", { operation: "SUBMIT", version: 1 }), 201);
    status(await post(notePath, "clinicalSupervisor", { operation: "RETURN", version: 2, remarks: "Aclare el aporte ficticio." }), 201);
    status(await post(notePath, "intern", { operation: "EDIT", version: 3, narrative: "Aporte corregido ficticio." }), 201);
    status(await post(notePath, "intern", { operation: "SUBMIT", version: 4 }), 201);
    const workload = status(await post(`practices/${practiceId}/hours`, "intern", { day, kind: "TRAINING", minutes: 95 }), 201);
    status(await post(`practices/${practiceId}/hours/${workload.id}`, "intern", { status: "APPROVED" }), 404);
    status(await post(`practices/${practiceId}`, "clinicalCoordinator", { ...change,
      supervisorId: fixtures.supervisorB!.accountId, version: 2, reason: "Cambio de supervisor de prueba",
    }), 201);
    status(await post(notePath, "clinicalSupervisor", { operation: "VALIDATE", version: 5 }), 404);
    const approved = status(await post(notePath, "supervisorB", { operation: "VALIDATE", version: 5 }), 201);
    expect(approved).toMatchObject({ authorId: fixtures.intern!.accountId, validatorId: fixtures.supervisorB!.accountId });
    status(await post(`practices/${practiceId}/hours/${workload.id}`, "supervisorB", { status: "APPROVED" }), 201);
    expect(status(await get(`practices/${practiceId}/export`, "supervisorB"), 200)).toEqual([{ day, kind: "TRAINING", minutes: 95 }]);
    const draftText = "Borrador privado que conserva su autoría tras vencer la práctica.";
    const returnedText = "Aporte privado devuelto, todavía sin nueva revisión.";
    const draft = status(await post(casePath(`encounters/${encounterId}/notes`), "intern", { narrative: draftText }), 201);
    const returned = status(await post(casePath(`encounters/${encounterId}/notes`), "intern", { narrative: returnedText }), 201);
    status(await post(casePath(`notes/${returned.id}`), "intern", { operation: "SUBMIT", version: 1 }), 201);
    status(await post(casePath(`notes/${returned.id}`), "supervisorB", {
      operation: "RETURN", version: 2, remarks: "Aporte sintético pendiente de revisión posterior.",
    }), 201);
    const responsible = await prisma.userAccount.findUniqueOrThrow({
      where: { id: fixtures.supervisorB!.accountId }, include: { person: true },
    });
    const pendingNotes = [
      { id: draft.id, status: "DRAFT", authorFunction: "INTERN", responsibleName: responsible.person.displayName },
      { id: returned.id, status: "RETURNED", authorFunction: "INTERN", responsibleName: responsible.person.displayName },
    ];
    const own = status(await get(casePath(), "intern"), 200).encounters.find((item: { id: string }) => item.id === encounterId);
    expect(own.documentation).toEqual({ total: 3, validated: 1, pending: 2 });
    expect(own.pendingNotes).toEqual(pendingNotes);
    const priorSupervisor = status(await get(casePath(), "clinicalSupervisor"), 200).encounters
      .find((item: { id: string }) => item.id === encounterId);
    expect(priorSupervisor.documentation).toEqual({ total: 0, validated: 0, pending: 0 });
    expect(priorSupervisor.pendingNotes).toEqual([]);

    status(await post(`practices/${practiceId}`, "clinicalCoordinator", { ...change, state: "SUSPENDED",
      supervisorId: fixtures.supervisorB!.accountId, version: 3,
    }), 201);
    status(await get(casePath(), "intern"), 404);
    status(await post(casePath(`notes/${draft.id}`), "intern", { operation: "SUBMIT", version: 1 }), 404);
    const supervised = status(await get(casePath(), "supervisorB"), 200).encounters
      .find((item: { id: string }) => item.id === encounterId);
    expect(supervised.documentation).toEqual({ total: 3, validated: 1, pending: 2 });
    expect(supervised.pendingNotes).toEqual(pendingNotes);
    expect(supervised.notes.some((item: { id: string }) => item.id === draft.id || item.id === returned.id)).toBe(false);
    expect(JSON.stringify(supervised)).not.toContain(draftText);
    expect(JSON.stringify(supervised)).not.toContain(returnedText);
    status(await post(`practices/${practiceId}`, "clinicalCoordinator", { ...change,
      supervisorId: fixtures.supervisorB!.accountId, version: 4,
    }), 201);
    await prisma.practice.update({ where: { id: practiceId }, data: { endsAt: now(-1_000) } });
    status(await get(casePath(), "intern"), 404);
    status(await post(casePath(`notes/${returned.id}`), "intern", { operation: "SUBMIT", version: 3 }), 404);
    for (const actor of ["reception", "clinicalPatient", "professionalB", "supervisorB", "intern"]) {
      status(await post(casePath(`encounters/${encounterId}/complete`), actor, {}), 404);
    }
    const completed = status(await post(casePath(`encounters/${encounterId}/complete`), "professional", {}), 201);
    expect(completed.status).toBe("COMPLETED");
    const treated = status(await get(casePath(), "professional"), 200).encounters
      .find((item: { id: string }) => item.id === encounterId);
    expect(treated.documentation).toEqual({ total: 4, validated: 2, pending: 2 });
    expect(treated.pendingNotes).toEqual(pendingNotes);
    expect(treated.notes.some((item: { id: string }) => item.id === draft.id || item.id === returned.id)).toBe(false);
    expect(JSON.stringify(treated)).not.toContain(draftText);
    expect(JSON.stringify(treated)).not.toContain(returnedText);
    const retained = await prisma.clinicalNote.findMany({
      where: { id: { in: [draft.id, returned.id] } },
      select: { id: true, status: true, authorId: true, practiceId: true, version: true, narrative: true, validatorId: true },
    });
    expect(retained).toEqual(expect.arrayContaining([
      { id: draft.id, status: "DRAFT", authorId: fixtures.intern!.accountId, practiceId, version: 1,
        narrative: draftText, validatorId: null },
      { id: returned.id, status: "RETURNED", authorId: fixtures.intern!.accountId, practiceId, version: 3,
        narrative: returnedText, validatorId: null },
    ]));
  });

  it("permite documentación tardía y cierre sin notas sin alterar atención ni asistencia", async () => {
    const completed = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(completed.status).toBe("COMPLETED");
    for (const actor of ["reception", "clinicalPatient", "professionalB", "intern"]) {
      status(await post(casePath(`encounters/${encounterId}/notes`), actor, { narrative: "Intento sintético no autorizado." }), 404);
    }
    const late = status(await post(casePath(`encounters/${encounterId}/notes`), "professional", {
      narrative: "Documentación sintética registrada después de concluir la atención.",
    }), 201);
    expect(late).toMatchObject({ status: "DRAFT", authorId: fixtures.professional!.accountId,
      authorFunction: "TREATING_PROFESSIONAL", occurredAt: completed.occurredAt.toISOString(), validatorId: null });
    expect(new Date(late.recordedAt).getTime()).toBeGreaterThanOrEqual(completed.completedAt!.getTime());
    expect(await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).toEqual(completed);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).attendance).toBe(appointment.attendance);
    expect(status(await post(casePath(`encounters/${encounterId}/complete`), "professional", {}), 201).completedAt)
      .toBe(completed.completedAt!.toISOString());
    await prisma.careCase.update({ where: { id: caseId }, data: { status: "CLOSED", closedAt: now() } });
    try {
      status(await post(casePath(`encounters/${encounterId}/notes`), "professional", { narrative: "Caso cerrado de prueba." }), 404);
    } finally {
      await prisma.careCase.update({ where: { id: caseId }, data: { status: "OPEN", closedAt: null } });
    }

    const startsAt = now(-120 * hours);
    const endsAt = new Date(startsAt.getTime() + appointment.durationMinutes * 60_000);
    const emptyBooking = await prisma.appointment.create({ data: {
      caseId, professionalId: appointment.professionalId, serviceId: appointment.serviceId,
      serviceName: appointment.serviceName, tariffId: appointment.tariffId, createdByAccountId: appointment.createdByAccountId,
      durationMinutes: appointment.durationMinutes, marginMinutes: appointment.marginMinutes,
      currency: appointment.currency, amountMinor: appointment.amountMinor, modality: appointment.modality,
      startsAt, endsAt, occupiedUntil: new Date(endsAt.getTime() + appointment.marginMinutes * 60_000),
      status: "CONFIRMED", attendance: "UNRECORDED",
    } });
    const empty = status(await post(casePath("encounters"), "professional", { appointmentId: emptyBooking.id }), 201);
    expect(status(await post(casePath(`encounters/${empty.id}/complete`), "professional", {}), 201).status).toBe("COMPLETED");
    expect(await prisma.clinicalNote.count({ where: { encounterId: empty.id } })).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: emptyBooking.id } })).attendance).toBe("UNRECORDED");
    const emptyRecord = status(await get(casePath(), "professional"), 200).encounters
      .find((item: { id: string }) => item.id === empty.id);
    expect(emptyRecord.documentation).toEqual({ total: 0, validated: 0, pending: 0 });
    expect(emptyRecord.pendingNotes).toEqual([]);
  });

  it("publica versiones concretas, autoriza cada descarga y no registra una subida que falla", async () => {
    status(await post(casePath("files"), "professional", { ...upload, name: "activo.html" }), 400);
    status(await post(casePath("files"), "professional", { ...upload, data: Buffer.from("<script>hola</script>").toString("base64") }), 400);
    const atLimit = status(await post(casePath("files"), "professional", {
      ...upload, data: Buffer.alloc(16_384, "a").toString("base64"),
    }), 201);
    expect(atLimit.bytes).toBe(16_384);
    const beforeOversize = await prisma.privateAttachment.count({ where: { caseId } });
    status(await post(casePath("files"), "professional", {
      ...upload, data: Buffer.alloc(16_385, "a").toString("base64"),
    }), 400);
    expect(await prisma.privateAttachment.count({ where: { caseId } })).toBe(beforeOversize);
    const evidence = status(await post(casePath("files"), "professional", { ...upload, consentId }), 201);
    status(await get(`files/${evidence.id}`, "clinicalPatient"), 404);
    status(await post(casePath(`files/${evidence.id}/share`), "professional", { reviewed: true }), 404);
    const item = status(await post(casePath("files"), "professional", upload), 201);
    expect(item.storageKey).toBeUndefined();
    status(await get(`files/${item.id}`, "clinicalPatient"), 404);
    status(await get(`files/${item.id}`, "professionalB"), 404);
    const newVersion = status(await post(casePath("files"), "professional", { ...upload, previousId: item.id }), 201);
    expect(newVersion.version).toBe(2);
    const info = status(await post(casePath("requests"), "clinicalPatient", { scope: "Copia de un documento sintético." }), 201);
    const path = casePath(`requests/${info.id}`);
    status(await post(path, "professional", { operation: "DELIVER", attachmentId: item.id }), 409);
    status(await post(path, "professional", { operation: "VERIFY", identityChecked: true }), 201);
    status(await post(path, "professional", { operation: "REVIEW", thirdPartyReviewed: true }), 201);
    status(await post(path, "professional", { operation: "DELIVER", attachmentId: item.id }), 201);
    const downloaded = await get(`files/${item.id}`, "clinicalPatient");
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["cache-control"]).toBe("no-store, private");
    expect(downloaded.headers["content-disposition"]).toContain("attachment");
    expect(downloaded.body).toEqual(bytes);
    status(await get(`files/${newVersion.id}`, "clinicalPatient"), 404);

    const moved = join(dir, "objects-preserved");
    await rename(storage, moved);
    await writeFile(storage, "FBE storage failure fixture", { mode: 0o600 });
    const before = await prisma.privateAttachment.count({ where: { caseId } });
    try {
      status(await post(casePath("files"), "professional", upload), 503);
      expect(await prisma.privateAttachment.count({ where: { caseId } })).toBe(before);
    } finally {
      await rm(storage);
      await rename(moved, storage);
    }
    const grantsEnd = status(await post(casePath("grants"), "clinicalCoordinator", {
      accountId: fixtures.professionalB!.accountId, function: "TREATING_PROFESSIONAL", endsAt: now(60_000).toISOString(),
    }), 201).id;
    expect((await get(`files/${item.id}`, "professionalB")).status).toBe(200);
    await prisma.caseAssignment.update({ where: { id: grantsEnd }, data: { startsAt: now(-hours), endsAt: now(-1_000) } });
    status(await get(`files/${item.id}`, "professionalB"), 404);
    status(await post(casePath(`grants/${treatmentGrant}/revoke`), "clinicalCoordinator", {}), 201);
    status(await get(`files/${item.id}`, "professional"), 404);
    status(await get(casePath(), "professional"), 404);
    status(await post(casePath(`encounters/${encounterId}/notes`), "professional", { narrative: "Permiso revocado de prueba." }), 404);
    expect(await prisma.clinicalNote.findUnique({ where: { id: noteId } })).not.toBeNull();
  });
});
