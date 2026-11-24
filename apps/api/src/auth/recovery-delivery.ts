import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "@fbe/config";

type ResetMessage = Readonly<{ email: string; url: string; token: string }>;

const testMessages = new Map<string, ResetMessage>();

export async function deliverPasswordReset(message: ResetMessage): Promise<void> {
  const config = loadConfig();
  if (config.appEnv === "production") {
    throw new Error("PASSWORD_RESET_DELIVERY_NOT_CONFIGURED");
  }

  if (config.appEnv === "test") {
    testMessages.set(message.email, message);
    return;
  }

  const outbox = resolve(process.cwd(), ".local", "recovery-outbox");
  await mkdir(outbox, { recursive: true, mode: 0o700 });
  const fileName = `${createHash("sha256").update(message.email).digest("hex")}.json`;
  await writeFile(
    resolve(outbox, fileName),
    `${JSON.stringify({ email: message.email, url: message.url }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export function takeTestResetMessage(email: string): ResetMessage | undefined {
  const message = testMessages.get(email);
  testMessages.delete(email);
  return message;
}
