import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, ".env");
const example = resolve(root, ".env.example");

try {
  await access(target, constants.F_OK);
  process.stderr.write(".env ya existe; no se sobrescribió.\n");
  process.exitCode = 1;
} catch {
  const authSecret = randomBytes(48).toString("base64url");
  const databasePassword = randomBytes(24).toString("base64url");
  const template = await readFile(example, "utf8");
  const environment = template
    .replace("replace-with-32-or-more-random-characters", authSecret)
    .replaceAll("replace-with-a-random-local-password", databasePassword);
  await writeFile(target, environment, { mode: 0o600, flag: "wx" });
  process.stdout.write("Se creó .env con secretos locales aleatorios y permisos 0600.\n");
}
