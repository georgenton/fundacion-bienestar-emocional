import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { prisma } from "@fbe/database";
import { chromium, devices } from "playwright";

const web = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const api = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
assert([web, api].every(value => /^http:\/\/localhost:\d+$/.test(value)) && process.env.SYNTHETIC_DATA_ONLY === "true");
const { actors, synthetic } = JSON.parse(await readFile(".local/demo-credentials.json", "utf8"));
assert(synthetic);
const browser = await chromium.launch();
const mark = randomUUID().slice(0, 8).toUpperCase();
const [clock] = await prisma.$queryRaw`SELECT clock_timestamp() AS now`;
const shifted = hours => new Date(clock.now.getTime() + hours * 3_600_000);
const day = shifted(72).toISOString().slice(0, 10);
const file = Buffer.from("Comprobante exclusivamente ficticio del recorrido de prueba.\n");
const button = (locator, name) => locator.getByRole("button", { name, exact: true });
let phase = "sesiones de prueba";

async function session(actor, mobile = false) {
  const page = await browser.newPage(mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 900 } });
  await page.goto(web);
  await page.getByLabel("Correo sintético").fill(actor.email);
  await page.getByLabel("Contraseña").fill(actor.password);
  await button(page, "Iniciar sesión").click();
  if (actor.totpSecret) {
    await page.getByLabel("Código TOTP").fill(await createOTP(base32.decode(actor.totpSecret)).totp());
    await button(page, "Verificar").click();
  }
  await button(page, actor === actors.finance ? "Economía" : "Casos").waitFor();
  return page;
}
async function call(page, route, data, status = data ? 201 : 200) {
  const response = await page.request.fetch(`${api}/api/${route}`, {
    method: data ? "POST" : "GET", headers: { origin: web }, ...(data ? { data } : {}),
  });
  assert.equal(response.status(), status, `${phase} · ${route.split("/")[0]}`);
  return status >= 400 ? null : response.json();
}
async function submit(page, target, name, endpoint) {
  const result = page.waitForResponse(response => response.url() === `${api}/api/${endpoint}` && response.request().method() === "POST");
  await button(target, name).click();
  const response = await result;
  assert.equal(response.status(), 201, phase);
  return response.json();
}
function expand(page, name) {
  return page.getByText(name, { exact: true }).locator("xpath=self::summary").click();
}
function form(page, submitLabel) {
  return page.locator("form").filter({ has: button(page, submitLabel) });
}
const command = (page, action, body) => call(page, "economy/commands", { action, ...body, requestId: randomUUID() });
const amount = amountMinor => ({ amountMinor, currency: "USD" });

try {
  const reception = await session(actors.reception);
  const patient = await session(actors.clinicalPatient, true);
  const finance = await session(actors.finance);
  const professional = await session(actors.professional);
  const proId = actors.professional.accountId;

  phase = "reservar y registrar obligación desde agenda";
  const service = await call(reception, "agenda/catalog/services", {
    name: `Consulta económica ficticia ${mark}`, enabled: true, durationMinutes: 45, marginMinutes: 0, modalities: ["ONLINE"],
  });
  await call(reception, "agenda/catalog/eligibility", { serviceId: service.id, professionalId: proId, enabled: true });
  await call(reception, "agenda/catalog/hours", {
    professionalId: proId, weekday: new Date(`${day}T12:00:00Z`).getUTCDay() || 7,
    opensMinute: 420, closesMinute: 1200, enabled: true,
  });
  const tariff = await call(reception, "agenda/catalog/tariffs", { serviceId: service.id, ...amount(4000) });
  const care = await call(reception, "cases", { personId: actors.clinicalPatient.personId, serviceId: service.id, modality: "ONLINE" });
  await call(reception, `cases/${care.id}/assignments`, { professionalId: proId });
  await reception.reload();
  await button(reception, "Agenda").click();
  await expand(reception, "Reservar cita");
  await reception.locator('select[name="caseId"]').selectOption(care.id);
  await reception.getByLabel("Profesional para la reserva").selectOption(proId);
  await reception.getByLabel("Inicio de la cita").fill(`${day}T13:00`);
  const held = await submit(reception, reception, "Crear reserva temporal", "agenda/appointments/hold");
  const card = reception.locator("article.appointment").filter({ hasText: service.name });
  await expand(card, "Acciones de cita");
  const booking = await submit(reception, card, "Confirmar cita", `agenda/appointments/${held.id}/confirm`);
  const obligation = await submit(reception, card, "Registrar obligación", "economy/commands");

  phase = "declarar pago y descargar comprobante privado";
  const ref = `SYN-BROWSER-${mark}`;
  await button(patient, "Economía").click();
  const debt = patient.locator("article").filter({ hasText: service.name });
  await debt.getByText(/Saldo/).waitFor();
  await expand(patient, "Declarar pago sintético");
  const declaration = form(patient, "Registrar declaración");
  await declaration.locator('select[name="obligationId"]').selectOption(obligation.id);
  await declaration.getByLabel("Referencia ficticia").fill(ref);
  await declaration.getByLabel("Importe en centavos USD").fill("2500");
  const receipt = await submit(patient, declaration, "Registrar declaración", "economy/commands");
  const patientReceipt = patient.locator("article").filter({ hasText: ref });
  await expand(patientReceipt, "Subir comprobante de prueba");
  await patientReceipt.locator('input[type="file"]').setInputFiles({ name: "pago.txt", mimeType: "text/plain", buffer: file });
  const evidence = await submit(patient, patientReceipt, "Guardar comprobante", `economy/receipts/${receipt.id}/evidence`);
  const download = patient.waitForEvent("download");
  await button(patientReceipt, "Descargar Comprobante sintético").click();
  assert.deepEqual(await readFile(await (await download).path()), file);
  await call(professional, `economy/evidence/${evidence.id}`, null, 404);

  phase = "verificar y aplicar importe parcial";
  await button(finance, "Economía").click();
  const cashReceipt = finance.locator("article").filter({ hasText: ref });
  await cashReceipt.getByRole("checkbox").check();
  await submit(finance, cashReceipt, "Verificar referencia", "economy/commands");
  await expand(cashReceipt, "Aplicar o devolver fondos");
  const scoped = cashReceipt.locator("form").filter({ has: button(finance, "Aplicar pago") });
  await scoped.locator('select[name="obligationId"]').selectOption(obligation.id);
  await scoped.getByLabel("Importe en centavos USD").fill("2500");
  await submit(finance, scoped, "Aplicar pago", "economy/commands");
  await button(patient, "Agenda").click();
  await button(patient, "Economía").click();
  await debt.getByText(/Saldo.*15[,.]00/).waitFor();

  phase = "consultar liquidación profesional";
  // An attended historical fixture keeps the journey independent of wall-clock waiting.
  const attended = await prisma.appointment.create({ data: {
    caseId: care.id, professionalId: proId, serviceId: service.id, serviceName: service.name, tariffId: tariff.id,
    createdByAccountId: actors.reception.accountId, durationMinutes: 45, marginMinutes: 0, ...amount(4000), modality: "ONLINE",
    startsAt: shifted(-120), endsAt: shifted(-119.25), occupiedUntil: shifted(-119.25), status: "CONFIRMED", attendance: "ATTENDED",
  } });
  const historical = await command(finance, "OBLIGATION", { appointmentId: attended.id });
  const paid = await command(finance, "DECLARE", { obligationId: historical.id, payerId: actors.clinicalPatient.personId,
    kind: "PAYMENT", reference: `SYN-BROWSER-HIST-${mark}`, ...amount(2000) });
  await command(finance, "VERIFY", { receiptId: paid.id, confirmed: true });
  await command(finance, "APPLY", { receiptId: paid.id, obligationId: historical.id, ...amount(2000) });
  const { id: settlementId } = await command(finance, "SETTLEMENT", { professionalId: proId, basisPoints: 5000 });
  await command(finance, "SETTLEMENT_APPROVE", { settlementId });
  await command(finance, "SETTLEMENT_EXECUTE", { settlementId });
  await button(professional, "Economía").click();
  await professional.getByRole("heading", { name: /10[,.]00.*Ejecución simulada/ }).waitFor();

  phase = "enlace administrado y revocación local del turno";
  await button(patient, "Recordatorios").click();
  await submit(patient, patient, "Aceptar recordatorios en la bandeja privada", "portal/preferences");
  for (const page of [professional, patient]) {
    await button(page, "Agenda").click();
    await page.getByLabel("Fecha de la agenda").fill(day);
    await button(page.locator("article.appointment").filter({ hasText: service.name }), "Videoconsulta").click();
  }
  const url = `https://meet.google.com/fbe-${mark.slice(0, 4).replace(/[^A-F]/g, "a").toLowerCase()}-${mark.slice(4, 7).replace(/[^A-F]/g, "b").toLowerCase()}`;
  await professional.getByLabel("Enlace HTTPS del participante").fill(url);
  await professional.getByRole("checkbox", { name: /Revisé la admisión/ }).check();
  await submit(professional, professional, "Registrar enlace administrado", `portal/video/${booking.id}`);
  await call(finance, `portal/video/${booking.id}/join`, {}, 404);
  await patient.context().route("https://meet.google.com/**", route =>
    route.fulfill({ contentType: "text/plain", body: "Navegación de participante interceptada en Chromium." }));
  await button(patient, "Videoconsulta").click();
  await button(patient, "Videoconsulta").click();
  const popup = patient.waitForEvent("popup");
  await button(patient, "Abrir enlace de participante").click();
  const destination = await popup;
  await destination.waitForURL(url);
  await call(reception, `agenda/appointments/${booking.id}/cancel`, {
    version: booking.version, reason: "Ensayo de retiro local", party: "ADMINISTRATIVE", requestId: randomUUID(),
  });
  await call(patient, `portal/video/${booking.id}/join`, {}, 404);
  const metadata = await call(professional, `portal/video/${booking.id}`);
  assert.equal(metadata.externalPending, true);
  const obsolete = await prisma.reminderJob.findFirst({ where: { appointmentId: booking.id } });
  assert.equal(obsolete?.appointmentVersion, booking.version);
  assert.equal(await prisma.reminderDelivery.count({ where: { jobId: obsolete.id } }), 0);
  console.log("Chromium bloque 4: cita, obligación, comprobante privado, pago parcial, liquidación y acceso de video interceptado verificados.");
} catch (error) {
  console.error(`Falló el recorrido sintético en la etapa ${phase}.`);
  throw error;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
