import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ServiceUnavailableException } from "@nestjs/common";
import { invalid, text } from "../operations/input.js";

export const maxFileBytes = 16_384;
export const maxStoredBytes = 98_304;

export function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodeTextFile(input: Record<string, unknown>) {
  const name = text(input.name, 5, 150);
  const encoded = text(input.data, 4, Math.ceil(maxFileBytes / 3) * 4);
  if (!/\.txt$/i.test(name) || input.mediaType !== "text/plain" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    invalid("ATTACHMENT_TYPE_INVALID");
  }
  const file = Buffer.from(encoded, "base64");
  if (!file.length || file.length > maxFileBytes || file.toString("base64") !== encoded) invalid("ATTACHMENT_SIZE_INVALID");
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(file);
  } catch {
    invalid("ATTACHMENT_CONTENT_INVALID");
  }
  if (!content.trim() || /[<>\p{Cf}\p{Zl}\p{Zp}\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u.test(content)) {
    invalid("ATTACHMENT_CONTENT_INVALID");
  }
  return file;
}

function directory() {
  return resolve(process.env.FBE_PRIVATE_ATTACHMENTS_DIR || ".local/private-attachments");
}

function objectPath(key: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key)) throw new Error("INVALID_INTERNAL_STORAGE_KEY");
  return join(directory(), key);
}

const storageError = () => new ServiceUnavailableException({ code: "PRIVATE_STORAGE_UNAVAILABLE" });

export async function storePrivate(key: string, bytes: Buffer) {
  const path = objectPath(key);
  const temporary = join(directory(), `.partial-${randomUUID()}`);
  try {
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    // The final name never points to incomplete content. It is not a public URL.
    await link(temporary, path);
    const parent = await open(directory(), "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch {
    throw storageError();
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function discardPrivate(key: string) {
  await unlink(objectPath(key)).catch(() => undefined);
}

export async function readPrivate(file: { storageKey: string; bytes: number; sha256: string }) {
  try {
    const handle = await open(objectPath(file.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const details = await handle.stat();
      if (!details.isFile() || details.size !== file.bytes || details.size > maxFileBytes) throw new Error();
      const content = await handle.readFile();
      if (sha256(content) !== file.sha256) throw new Error();
      return content;
    } finally {
      await handle.close();
    }
  } catch {
    throw storageError();
  }
}
