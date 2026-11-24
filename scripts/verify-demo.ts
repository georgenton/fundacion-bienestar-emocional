import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const localDirectory = resolve(root, ".local");

async function run(command: string, args: string[], extraEnvironment: NodeJS.ProcessEnv = {}): Promise<{ output: string; code: number }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...extraEnvironment },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ output, code: code ?? 1 });
    });
  });
}

await mkdir(localDirectory, { recursive: true, mode: 0o700 });
const seed = await run("pnpm", ["db:seed"], { ALLOW_SYNTHETIC_SEED: "true" });
const tests = seed.code === 0
  ? await run("pnpm", ["test:integration"], { APP_ENV: "test", ALLOW_SYNTHETIC_SEED: "false" })
  : { output: "", code: 1 };
const captured = `${seed.output}${tests.output}`;
await writeFile(resolve(localDirectory, "test-output.log"), captured, { mode: 0o600 });

// Public CI must inspect captured output before publishing it to the job log,
// including when a test fails and its assertion would print a credential.
const scan = await run("pnpm", ["logs:scan"]);
if (scan.code !== 0) {
  process.stderr.write("La verificación de registros falló. La salida capturada no se publica; revisar el archivo local de forma privada.\n");
  process.exitCode = 1;
} else {
  process.stdout.write(captured);
  process.stdout.write(scan.output);
  process.exitCode = seed.code !== 0 ? seed.code : tests.code;
}
