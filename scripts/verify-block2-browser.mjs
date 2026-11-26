import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { chromium, devices } from "playwright";

const web = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const api = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
const localUrl = (value) => new URL(value).protocol === "http:" && new URL(value).hostname === "localhost";
assert(localUrl(web) && localUrl(api) && process.env.SYNTHETIC_DATA_ONLY === "true",
  "Use a disposable local environment with synthetic fixtures");
const fixture = JSON.parse(await readFile(".local/demo-credentials.json", "utf8"));
assert(fixture.synthetic === true);
const reception = fixture.actors.reception;
const professional = fixture.actors.professional;
const testId = randomUUID().slice(0, 8);
const personName = `Paciente Navegador Sintético ${testId}`;
const service = `Consulta Sintética Navegador ${testId}`;
const email = `navegador-${testId}@example.test`;
const password = `Synthetic!${randomUUID()}`;
const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
const outbox = resolve("apps/api/.local/invitation-outbox", `${createHash("sha256").update(email).digest("hex")}.json`);
const browser = await chromium.launch();
let stage = "abrir sesión de recepción";

async function login(page, email, password, secret) {
  await page.goto(web);
  await page.getByLabel("Correo sintético", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  if (secret) {
    await page.getByLabel("Código TOTP").waitFor();
    await page.getByLabel("Código TOTP").fill(await createOTP(base32.decode(secret)).totp());
    await page.getByRole("button", { name: "Verificar", exact: true }).click();
  }
}

async function submit(page, button, endpoint, method = "POST") {
  const response = page.waitForResponse(result => {
    const url = new URL(result.url());
    return url.origin === api && url.pathname === `/api/${endpoint}` && result.request().method() === method;
  });
  await button.click();
  const result = await response;
  assert.equal(result.ok(), true, `HTTP ${result.status()} en ${stage}`);
  return result.json();
}

function expand(page, title) {
  return page.locator("summary").filter({ hasText: new RegExp(`^${title}$`) }).click();
}
function button(page, name) {
  return page.getByRole("button", { name, exact: true });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Tokyo" });
  page.setDefaultTimeout(9_000);
  await login(page, reception.email, reception.password, reception.totpSecret);
  await button(page, "Configuración").waitFor();
  stage = "configurar servicio, habilitación, horario y tarifa";
  await button(page, "Configuración").click();
  await page.getByLabel("Nombre del servicio").fill(service);
  const createdService = await submit(page, button(page, "Guardar servicio"), "agenda/catalog/services");
  await page.getByLabel("Servicio para editar").selectOption(createdService.id);
  await expand(page, "Habilitación por profesional");
  const eligibility = page.locator("details").filter({ has: button(page, "Guardar habilitación") });
  await eligibility.locator("select[name=serviceId]").selectOption(createdService.id);
  await eligibility.locator("select[name=professionalId]").selectOption(professional.accountId);
  await submit(page, button(page, "Guardar habilitación"), "agenda/catalog/eligibility");

  await expand(page, "Crear versión de tarifa");
  const tariff = page.locator("details").filter({ has: button(page, "Agregar tarifa") });
  await tariff.locator("select[name=serviceId]").selectOption(createdService.id);
  await tariff.getByLabel("Importe en centavos de USD").fill("2800");
  await submit(page, button(page, "Agregar tarifa"), "agenda/catalog/tariffs");
  await page.getByLabel("Profesional para configurar").selectOption(professional.accountId);
  await page.locator("select[name=weekday]").selectOption(String(weekday));
  await submit(page, button(page, "Guardar horario"), "agenda/catalog/hours");

  stage = "registrar persona sin cuenta, buscarla y abrir caso";
  await button(page, "Personas").click();
  await page.getByLabel("Nombre de la persona").fill(personName);
  await page.getByLabel("Correo de contacto (opcional)").fill("contacto-navegador@example.test");
  const person = await submit(page, button(page, "Guardar persona"), "people");
  assert.equal(person.userAccount, null);
  await page.getByRole("heading", { name: personName }).waitFor();
  await page.getByLabel("Nombre o correo de contacto").fill(personName);
  await submit(page, button(page, "Buscar"), "people", "GET");
  await page.getByRole("button", { name: new RegExp(personName) }).waitFor();

  await expand(page, "Abrir caso individual");
  const openCase = page.locator("details").filter({ has: button(page, "Abrir caso") });
  await openCase.locator("select[name=serviceId]").selectOption(createdService.id);
  await openCase.locator("select[name=modality]").selectOption("IN_PERSON");
  const careCase = await submit(page, button(page, "Abrir caso"), "cases");
  await page.getByText(careCase.referenceCode, { exact: true }).waitFor();

  stage = "asignar profesional e invitar a la persona";
  await expand(page, "Asignar profesional");
  const assignment = page.locator("details").filter({ has: button(page, "Guardar asignación") });
  await assignment.locator("select[name=professionalId]").selectOption(professional.accountId);
  await submit(page, button(page, "Guardar asignación"), `cases/${careCase.id}/assignments`);
  await page.getByText(/Resumen y agenda/).waitFor();
  await expand(page, "Invitar al portal");
  await page.getByLabel("Correo sintético de acceso").fill(email);
  await submit(page, button(page, "Crear invitación"), "invitations");

  stage = "reservar, confirmar, reprogramar y cancelar la cita";
  await button(page, "Agendar este caso").click();
  await page.getByRole("heading", { name: "Agenda", exact: true }).waitFor();
  await page.getByLabel("Profesional para la reserva").selectOption(professional.accountId);
  await page.getByLabel("Inicio de la cita").fill(`${date}T09:00`);
  const held = await submit(page, button(page, "Crear reserva temporal"), "agenda/appointments/hold");
  assert.equal(held.startsAt, `${date}T14:00:00.000Z`);
  let card = page.locator("article[data-appointment-status='HELD']").filter({ hasText: careCase.referenceCode });
  await card.locator("summary").click();
  const confirmed = await submit(page, button(page, "Confirmar cita"), `agenda/appointments/${held.id}/confirm`);
  assert.equal(confirmed.status, "CONFIRMED");

  card = page.locator("article[data-appointment-status='CONFIRMED']").filter({ hasText: careCase.referenceCode });
  const actions = card.locator("details");
  if (await actions.getAttribute("open") === null) await actions.locator("summary").click();
  await card.getByLabel("Nuevo inicio").fill(`${date}T11:00`);
  await card.getByLabel("Motivo de reprogramación").fill("Reprogramación del ensayo sintético");
  const moved = await submit(page, card.getByRole("button", { name: "Reprogramar cita" }), `agenda/appointments/${held.id}/reschedule`);
  assert.equal(moved.previousId, held.id);
  assert.equal(moved.startsAt, `${date}T16:00:00.000Z`);
  card = page.locator("article[data-appointment-status='CONFIRMED']").filter({ hasText: careCase.referenceCode });
  await card.locator("summary").click();
  await card.getByLabel("Quién cancela").selectOption("PATIENT");
  await card.getByLabel("Motivo de cancelación").fill("Cancelación del ensayo sintético");
  const cancelled = await submit(page, card.getByRole("button", { name: "Cancelar cita" }), `agenda/appointments/${moved.id}/cancel`);
  assert.equal(cancelled.cancellationParty, "PATIENT");
  await page.locator("article[data-appointment-status='CANCELLED']").filter({ hasText: careCase.referenceCode }).waitFor();

  stage = "activar en móvil y acceder al mismo caso";
  const invitation = JSON.parse(await readFile(outbox, "utf8"));
  assert.equal(invitation.email, email);
  const activation = new URL(invitation.activationUrl);
  assert.equal(activation.origin, web);
  assert.equal(activation.pathname, "/activate");
  assert(activation.hash.startsWith("#token="));
  const mobile = await browser.newPage({ ...devices["iPhone 13"], timezoneId: "Europe/Madrid" });
  mobile.setDefaultTimeout(9_000);
  await mobile.goto(activation.href);
  await mobile.getByLabel("Nueva contraseña").fill(password);
  await mobile.getByLabel("Repetir contraseña").fill(password);
  await submit(mobile, button(mobile, "Activar cuenta"), "invitations/activate");
  await mobile.getByRole("link", { name: "Ir a inicio de sesión" }).click();
  const me = mobile.waitForResponse(result => result.url() === `${api}/api/me` && result.ok());
  await login(mobile, email, password);
  const actor = await (await me).json();
  assert.equal(actor.personId, person.id);
  await mobile.getByRole("button", { name: new RegExp(careCase.referenceCode) }).click();
  await mobile.getByRole("heading", { name: "Resumen del caso" }).waitFor();
  assert.equal(await mobile.getByRole("button", { name: "Personas", exact: true }).count(), 0);
  await button(mobile, "Agenda").click();
  await mobile.getByLabel("Fecha de la agenda").fill(date);
  await mobile.locator("article[data-appointment-status='CANCELLED']").filter({ hasText: careCase.referenceCode }).waitFor();
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  console.log("Recorrido sintético Chromium aprobado: recepción con MFA y paciente en interfaz móvil.");
} catch (error) {
  const safe = error?.code === "ERR_ASSERTION" ? String(error.message).split("\n")[0] : error?.name ?? "Error";
  console.error(`Falló el paso «${stage}» (${safe}).`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await unlink(outbox).catch(() => undefined);
}
