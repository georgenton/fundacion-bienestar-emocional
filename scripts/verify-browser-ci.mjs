import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

process.umask(0o077);
const root = resolve(import.meta.dirname, "..");
const children = [];
let phase = "validate-disposable-ci";
let interrupted = false;
let capture;
let capturePath;
let failure;
let scanStatus = "not-run";

// Only these literal journey phases may be printed; never echo an error payload.
const browserPhases = {
  "browser-block-2": [
    "abrir sesión de recepción", "configurar servicio, habilitación, horario y tarifa",
    "registrar persona sin cuenta, buscarla y abrir caso", "asignar profesional e invitar a la persona",
    "reservar, confirmar, reprogramar y cancelar la cita", "activar en móvil y acceder al mismo caso",
  ],
  "browser-block-4": [
    "sesiones de prueba", "reservar y registrar obligación desde agenda",
    "declarar pago y descargar comprobante privado", "verificar y aplicar importe parcial",
    "consultar liquidación profesional", "enlace administrado y revocación local del turno",
  ],
  "browser-block-3": [
    "sesiones", "preparar cita con las operaciones del bloque 2", "asignación y práctica de simulación",
    "aceptar dos finalidades desde el portal móvil",
    "retirar la aceptación anterior después de publicar otra versión",
    "abrir atención y validar nota con adenda", "aporte y horas supervisadas",
    "compartir una versión privada y descargarla como paciente",
    "concluir la atención conservando documentación pendiente y agregar una nota posterior",
  ],
};

function signal(child, value) {
  if (child.finished || !child.process.pid) return;
  // Each child owns its process group, including pnpm or Chromium descendants.
  try { process.kill(-child.process.pid, value); } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function stop(child) {
  signal(child, "SIGTERM");
  const timeout = setTimeout(() => signal(child, "SIGKILL"), 5_000);
  try { await child.closed; } finally { clearTimeout(timeout); }
}

function start(executable, args, env, cwd = root) {
  assert(!interrupted, "Browser CI interrupted");
  const child = { finished: false };
  child.process = spawn(executable, args, {
    cwd, env, detached: true, stdio: ["ignore", capture.fd, capture.fd],
  });
  child.closed = new Promise(resolveResult => {
    child.process.once("error", () => { child.finished = true; resolveResult(1); });
    child.process.once("close", code => { child.finished = true; resolveResult(code ?? 1); });
  });
  children.push(child);
  return child;
}

async function run(executable, args, env, timeoutMs = 180_000) {
  const child = start(executable, args, env);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void stop(child); }, timeoutMs);
  try {
    const code = await child.closed;
    assert(code === 0 && !timedOut && !interrupted, "Browser CI command failed");
  } finally { clearTimeout(timeout); }
}

async function requireFreePort(port) {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", done);
  });
  await new Promise(done => server.close(done));
}

async function waitReady(url, child, api = false) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    assert(!child.finished && !interrupted, "Compiled application stopped before readiness");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000), redirect: "error" });
      if (response.status === 200) {
        if (!api) { await response.body?.cancel(); return; }
        const health = await response.json();
        if (health.status === "ok" && health.database === "reachable" && health.syntheticDataOnly === true) return;
      }
      await response.body?.cancel().catch(() => undefined);
    } catch { /* A bounded retry covers process startup only. */ }
    await delay(250);
  }
  throw new Error("Compiled application readiness timed out");
}

function validateEnvironment() {
  const env = process.env;
  assert(process.platform === "linux" && env.CI === "true" && env.GITHUB_ACTIONS === "true");
  assert(/^fbe-verify-\d+-\d+$/.test(env.COMPOSE_PROJECT_NAME ?? ""));
  assert(env.APP_ENV === "test" && env.APP_NAME === "FBE-CI-Synthetic");
  assert(env.SYNTHETIC_DATA_ONLY === "true" && env.ALLOW_SYNTHETIC_SEED === "false");
  assert(env.WEB_ORIGIN === "http://localhost:3000" && env.BETTER_AUTH_URL === "http://localhost:3001");
  assert(env.NEXT_PUBLIC_API_BASE_URL === env.BETTER_AUTH_URL && env.API_PORT === "3001");
  assert(env.POSTGRES_DB === "fbe_ci_synthetic" && env.POSTGRES_USER === "fbe_ci");
  const database = new URL(env.DATABASE_URL);
  assert(database.protocol === "postgresql:" && database.hostname === "localhost" && database.port === "55432");
  assert(database.pathname === "/fbe_ci_synthetic" && database.username === "fbe_ci" && database.password);
  assert(database.searchParams.get("schema") === "public");
}

async function scanCapturedOutput(env) {
  const scannerInput = resolve(root, ".local/test-output.log");
  let previous;
  try { previous = await readFile(scannerInput); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await writeFile(scannerInput, await readFile(capturePath), { mode: 0o600 });
    await run("pnpm", ["logs:scan"], env, 30_000);
  } finally {
    if (previous === undefined) await rm(scannerInput, { force: true });
    else await writeFile(scannerInput, previous, { mode: 0o600 });
  }
}

for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => {
  interrupted = true;
  for (const child of children) signal(child, "SIGTERM");
});

try {
  validateEnvironment();
  process.chdir(root);
  await requireFreePort(3000);
  await requireFreePort(3001);
  await mkdir(resolve(root, ".local"), { recursive: true, mode: 0o700 });
  const privateDirectory = await mkdtemp(resolve(root, ".local/browser-ci-"));
  capturePath = resolve(privateDirectory, "output.log");
  capture = await open(capturePath, "a", 0o600);
  const env = {
    ...process.env,
    NODE_ENV: "production",
    // The browser activation journey reads the private local outbox. APP_ENV=test
    // intentionally keeps invitations in memory for the integration tests.
    APP_ENV: "development",
    ALLOW_SYNTHETIC_SEED: "false",
    FBE_PRIVATE_ATTACHMENTS_DIR: resolve(privateDirectory, "attachments"),
  };

  phase = "refresh-synthetic-fixtures";
  await run("pnpm", ["db:seed"], { ...env, ALLOW_SYNTHETIC_SEED: "true" });

  phase = "start-compiled-application";
  const standalone = resolve(root, "apps/web/.next/standalone/apps/web");
  await cp(resolve(root, "apps/web/.next/static"), resolve(standalone, ".next/static"), { recursive: true });
  try { await cp(resolve(root, "apps/web/public"), resolve(standalone, "public"), { recursive: true }); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const api = start(process.execPath, ["dist/main.js"], env, resolve(root, "apps/api"));
  const web = start(process.execPath, [resolve(standalone, "server.js")], {
    ...env, HOSTNAME: "127.0.0.1", PORT: "3000",
  });
  await Promise.all([
    waitReady("http://127.0.0.1:3001/health", api, true),
    waitReady("http://127.0.0.1:3000", web),
  ]);

  phase = "browser-block-2";
  await run(process.execPath, ["scripts/verify-block2-browser.mjs"], env);
  phase = "browser-block-3";
  await run(process.execPath, ["scripts/verify-block3-browser.mjs"], env);
  phase = "browser-block-4";
  await run(process.execPath, ["scripts/verify-block4-browser.mjs"], env);
} catch {
  failure = phase;
} finally {
  await Promise.all(children.map(stop));
  if (capture && !interrupted) {
    try { await scanCapturedOutput(process.env); scanStatus = "passed"; } catch {
      scanStatus = "failed";
      failure ??= "sensitive-output-scan";
    }
  }
  await capture?.close();
}

if (failure || interrupted) {
  let knownPhase;
  if (capturePath && browserPhases[failure]) {
    const lines = (await readFile(capturePath, "utf8")).split(/\r?\n/);
    knownPhase = browserPhases[failure].find(value => lines.some(line => failure === "browser-block-2"
      ? line.startsWith(`Falló el paso «${value}» (`)
      : line === `Falló el recorrido sintético en la etapa ${value}.`));
  }
  console.error(`Synthetic browser CI failed at ${interrupted ? "interrupted" : failure}${knownPhase ? `; UI phase: ${knownPhase}` : ""}. Private output scan: ${scanStatus}. Raw logs are not uploaded.`);
  process.exitCode = 1;
} else {
  console.log("Synthetic Chromium journeys passed against compiled API and web: blocks 2, 3 and 4, desktop and mobile viewport. Private output scan passed.");
}
