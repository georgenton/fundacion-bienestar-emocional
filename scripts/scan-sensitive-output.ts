import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const logPath = resolve(root, ".local", "test-output.log");
const credentialsPath = resolve(root, ".local", "demo-credentials.json");

async function existingFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const logs = await existingFile(logPath);
if (!logs) {
  process.stdout.write("No existe .local/test-output.log; ejecute pnpm demo:verify para capturar y revisar registros.\n");
  process.exitCode = 1;
} else {
  const credentials = await existingFile(credentialsPath);
  const needles = new Set<string>();
  if (process.env.BETTER_AUTH_SECRET) needles.add(process.env.BETTER_AUTH_SECRET);
  if (process.env.POSTGRES_PASSWORD) needles.add(process.env.POSTGRES_PASSWORD);

  if (credentials) {
    const parsed = JSON.parse(credentials) as {
      actors: Record<string, { password?: string; totpSecret?: string; backupCodes?: string[] }>;
    };
    for (const actor of Object.values(parsed.actors)) {
      if (actor.password) needles.add(actor.password);
      if (actor.totpSecret) needles.add(actor.totpSecret);
      for (const code of actor.backupCodes ?? []) needles.add(code);
    }
  }

  const leakedGeneratedValue = [...needles].some((needle) => needle.length >= 6 && logs.includes(needle));
  const leakedHeader = /Bearer\s+(?!\[REDACTED\])\S+|(?:authorization|cookie)[:=]\s*(?!\[REDACTED\])\S+/i.test(logs);
  const clinicalContent = /clinicalNarrative|diagnosisText|sessionNoteBody/i.test(logs);

  if (leakedGeneratedValue || leakedHeader || clinicalContent) {
    throw new Error("SENSITIVE_OUTPUT_DETECTED");
  }
  process.stdout.write("Registros capturados: sin secretos generados, cabeceras de sesión ni contenido clínico.\n");
}
