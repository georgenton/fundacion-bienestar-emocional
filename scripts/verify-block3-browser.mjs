import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { chromium, devices } from "playwright";

const web = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const api = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
assert([web, api].every(value => /^http:\/\/localhost:\d+$/.test(value)) && process.env.SYNTHETIC_DATA_ONLY === "true");
const fixture = JSON.parse(await readFile(".local/demo-credentials.json", "utf8"));
assert(fixture.synthetic);
const { actors } = fixture;
const browser = await chromium.launch();
const mark = randomUUID().slice(0, 8);
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const now = () => new Date();
const date = shift => new Date(Date.now() + shift * 86400000);
const local = instant => new Date(instant.getTime() - 18_000_000).toISOString();
const button = (page, name) => page.getByRole("button", { name, exact: true });
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
const label = (page, name) => page.getByLabel(name, { exact: true });
let phase = "sesiones";

async function session(actor, mobile = false) {
  const page = await browser.newPage(mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 900 } });
  await page.goto(web);
  await label(page, "Correo sintético").fill(actor.email);
  await label(page, "Contraseña").fill(actor.password);
  await button(page, "Iniciar sesión").click();
  if (actor.totpSecret) {
    await page.getByLabel("Código TOTP").fill(await createOTP(base32.decode(actor.totpSecret)).totp());
    await button(page, "Verificar").click();
  }
  await button(page, "Casos").waitFor();
  return page;
}

async function call(page, route, data, status = data ? 201 : 200) {
  const response = await page.request.fetch(`${api}/api/${route}`, {
    method: data ? "POST" : "GET", headers: { origin: web }, ...(data ? { data } : {}),
  });
  assert.equal(response.status(), status, `${phase} · ${route.split("/")[0]}`);
  return status === 200 || status === 201 ? response.json() : null;
}

async function submit(page, name, endpoint) {
  const result = page.waitForResponse(response => response.url() === `${api}/api/${endpoint}` && response.request().method() === "POST");
  await button(page, name).click();
  const response = await result;
  assert.equal(response.status(), 201, phase);
  return response.json();
}

async function openCase(page, id, patient = false) {
  await button(page, patient ? "Consentimientos y documentos" : "Expediente").click();
  await label(page, "Caso del expediente").selectOption(id);
}

function expand(page, title) {
  return page.locator("summary").filter({ hasText: new RegExp(`^${title}$`) }).click();
}

try {
  const reception = await session(actors.reception);
  const coordinator = await session(actors.clinicalCoordinator);
  const professional = await session(actors.professional);
  const patient = await session(actors.clinicalPatient, true);
  const supervisor = await session(actors.clinicalSupervisor);
  const intern = await session(actors.intern);
  phase = "preparar cita con las operaciones del bloque 2";
  const proId = actors.professional.accountId;
  const service = await call(reception, "agenda/catalog/services", {
    name: `Consulta expediente ficticia ${mark}`, enabled: true, durationMinutes: 45, marginMinutes: 10, modalities: ["IN_PERSON"],
  });
  await call(reception, "agenda/catalog/eligibility", { serviceId: service.id, professionalId: proId, enabled: true });
  await call(reception, "agenda/catalog/hours", {
    professionalId: proId, weekday: new Date(`${day}T12:00:00Z`).getUTCDay() || 7,
    opensMinute: 480, closesMinute: 1100, enabled: true,
  });
  await call(reception, "agenda/catalog/tariffs", { serviceId: service.id, currency: "USD", amountMinor: 2000 });
  const care = await call(reception, "cases", { personId: actors.clinicalPatient.personId, serviceId: service.id, modality: "IN_PERSON" });
  await call(reception, `cases/${care.id}/assignments`, { professionalId: proId });
  const hold = await call(reception, "agenda/appointments/hold", {
    caseId: care.id, professionalId: proId, startsAt: `${day}T10:00:00-05:00`, requestId: randomUUID(),
  });
  await call(reception, `agenda/appointments/${hold.id}/confirm`, { version: hold.version, requestId: randomUUID() });
  const path = `clinical/cases/${care.id}`;
  await call(reception, path, null, 404);
  assert.equal(await button(reception, "Expediente").count(), 0);

  phase = "asignación y práctica de simulación";
  await openCase(coordinator, care.id);
  await label(coordinator, "Integrante").selectOption(proId);
  await submit(coordinator, "Asignar alcance clínico", `${path}/grants`);
  await label(coordinator, "Función").selectOption("SUPERVISOR");
  await label(coordinator, "Integrante").selectOption(actors.clinicalSupervisor.accountId);
  await submit(coordinator, "Asignar alcance clínico", `${path}/grants`);
  await button(coordinator, "Prácticas y horas").click();
  await expand(coordinator, "Registrar práctica sintética");
  await label(coordinator, "Pasante").selectOption(actors.intern.accountId);
  await label(coordinator, "Supervisor responsable").selectOption(actors.clinicalSupervisor.accountId);
  await label(coordinator, "Institución ficticia").fill(`Institución de prueba ${mark}`);
  await label(coordinator, "Referencia institucional de prueba").fill("REF-SIMULADA");
  await label(coordinator, "Inicio en Ecuador").fill(local(date(-2)).slice(0, 16));
  await label(coordinator, "Fin en Ecuador").fill(local(date(6)).slice(0, 16));
  const practice = await submit(coordinator, "Crear ficha de práctica", "clinical/practices");
  const practicePath = `clinical/practices/${practice.id}`;
  await label(coordinator, "Ficha de práctica").selectOption(practice.id);
  await expand(coordinator, "Cambiar supervisor o estado");
  await label(coordinator, "Habilitar participación clínica únicamente en la simulación").check();
  await label(coordinator, "Motivo del cambio").fill("Simulación institucional del recorrido.");
  await submit(coordinator, "Guardar cambio de práctica", practicePath);
  await openCase(coordinator, care.id);
  await label(coordinator, "Función").selectOption("INTERN");
  await label(coordinator, "Integrante").selectOption(actors.intern.accountId);
  await label(coordinator, "Práctica de simulación").selectOption(practice.id);
  await submit(coordinator, "Asignar alcance clínico", `${path}/grants`);

  phase = "aceptar dos finalidades desde el portal móvil";
  await openCase(patient, care.id, true);
  for (const purpose of ["Atención individual", "Participación supervisada de pasante"]) {
    const card = patient.locator("article").filter({ has: patient.getByRole("heading", { name: new RegExp(purpose) }) });
    await card.getByRole("checkbox").check();
    const accepted = patient.waitForResponse(response => response.url() === `${api}/api/${path}/consents` && response.request().method() === "POST");
    await card.getByRole("button", { name: "Aceptar texto de prueba" }).click();
    assert.equal((await accepted).status(), 201, phase);
    await card.getByRole("button", { name: "Retirar aceptación" }).waitFor();
  }

  phase = "abrir atención y validar nota con adenda";
  await openCase(professional, care.id);
  await label(professional, "Cita confirmada").selectOption(hold.id);
  const encounter = await submit(professional, "Abrir atención", `${path}/encounters`);
  await label(professional, "Nota sintética").fill("Narrativa ficticia en navegador.");
  const note = await submit(professional, "Crear borrador", `${path}/encounters/${encounter.id}/notes`);
  await submit(professional, "Validar nota", `${path}/notes/${note.id}`);
  await expand(professional, "Añadir adenda");
  await label(professional, "Motivo de la adenda").fill("Corrección de prueba");
  await label(professional, "Texto añadido").fill("Adenda íntegramente ficticia.");
  await submit(professional, "Guardar adenda", `${path}/notes/${note.id}/addenda`);

  phase = "aporte y horas supervisadas";
  await openCase(intern, care.id);
  await label(intern, "Nota sintética").fill("Aporte ficticio de pasante.");
  const contribution = await submit(intern, "Crear borrador", `${path}/encounters/${encounter.id}/notes`);
  assert.equal(await button(intern, "Validar nota").count(), 0);
  await submit(intern, "Enviar a revisión", `${path}/notes/${contribution.id}`);
  await button(intern, "Prácticas y horas").click();
  await label(intern, "Ficha de práctica").selectOption(practice.id);
  await label(intern, "Fecha de actividad").fill(local(now()).slice(0, 10));
  await label(intern, "Minutos").fill("90");
  const activity = await submit(intern, "Enviar actividad a revisión", `${practicePath}/hours`);
  await openCase(supervisor, care.id);
  const approved = await submit(supervisor, "Validar nota", `${path}/notes/${contribution.id}`);
  assert.equal(approved.authorId, actors.intern.accountId);
  assert.equal(approved.validatorId, actors.clinicalSupervisor.accountId);
  await button(supervisor, "Prácticas y horas").click();
  await label(supervisor, "Ficha de práctica").selectOption(practice.id);
  await submit(supervisor, "Aprobar horas", `${practicePath}/hours/${activity.id}`);

  phase = "compartir una versión privada y descargarla como paciente";
  await button(professional, "Documentos").click();
  await expand(professional, "Subir archivo sintético");
  await label(professional, "Título").fill("Resumen ficticio del expediente");
  const content = Buffer.from("Documento de prueba, sin información real.\n");
  await label(professional, "Archivo UTF-8 .txt de hasta 16 KiB").setInputFiles({
    name: "demostracion.txt", mimeType: "text/plain", buffer: content,
  });
  const file = await submit(professional, "Guardar archivo privado", `${path}/files`);
  const unshared = await patient.request.get(`${api}/api/clinical/files/${file.id}`);
  assert.equal(unshared.status(), 404);
  await button(professional, "Compartir esta versión").click();
  await label(professional, "Revisé esta versión y los datos de terceros.").check();
  await submit(professional, "Confirmar publicación al paciente", `${path}/files/${file.id}/share`);
  await button(patient, "Documentos").click();
  await heading(patient, "Resumen ficticio del expediente · v1").waitFor();
  const download = patient.waitForEvent("download");
  await button(patient, "Descargar Resumen ficticio del expediente").click();
  assert.deepEqual(await readFile(await (await download).path()), content);
  console.log("Chromium escritorio y viewport móvil: cita, consentimientos, expediente, adenda, supervisión, horas y descarga privada verificados.");
} catch (error) {
  console.error(`Falló el recorrido sintético en la etapa ${phase}.`);
  throw error;
} finally {
  await browser.close();
}
