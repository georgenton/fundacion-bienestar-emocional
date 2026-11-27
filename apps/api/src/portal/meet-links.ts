import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { loadConfig } from "@fbe/config";
import { invalid, text } from "../operations/input.js";

export const meetCapabilities = {
  provider: "GOOGLE_MEET", mode: "MANUAL", providerConnected: false,
  externalRevocation: "MANUAL_CONFIRMATION", automatedRecording: false, automatedTranscription: false,
} as const;

function key() {
  return Buffer.from(hkdfSync("sha256", loadConfig().authSecret, "fbe-meeting-links", "v1", 32));
}

export function protectMeetLink(input: unknown, appointmentId: string) {
  const url = text(input, 30, 48);
  if (!/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url)) invalid("PARTICIPANT_LINK_INVALID");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(appointmentId));
  const encoded = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return {
    encryptedLink: Buffer.concat([nonce, cipher.getAuthTag(), encoded]).toString("base64url"),
    linkDigest: createHash("sha256").update(url).digest("hex"),
  };
}

export function revealMeetLink(stored: string, appointmentId: string) {
  const object = Buffer.from(stored, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), object.subarray(0, 12));
  decipher.setAAD(Buffer.from(appointmentId));
  decipher.setAuthTag(object.subarray(12, 28));
  return Buffer.concat([decipher.update(object.subarray(28)), decipher.final()]).toString("utf8");
}
