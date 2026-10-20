// Pure helpers for linking a WhatsApp number to a cagie account (no Firebase imports, unit tested).
import { createHash } from "crypto";

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_FAILED_LINKS_PER_HOUR = 5;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I, same as pairing codes
const CODE_LENGTH = 6;
const HOUR_MS = 60 * 60 * 1000;

/** `rand(n)` must return an integer in [0, n); pass crypto.randomInt in production. */
export function newLinkCode(rand: (n: number) => number): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[rand(CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return code;
}

/** Document id for a WhatsApp id: numbers are never stored in plain text. */
export function hashJid(salt: string, jid: string): string {
  return createHash("sha256").update(salt + jid.trim().toLowerCase()).digest("hex");
}

export function normalizeCode(input: string): string {
  return String(input ?? "").replace(/\s+/g, "").toUpperCase();
}

export function codeUsable(doc: { expiresAt: number } | undefined | null, now: number): boolean {
  return !!doc && now < doc.expiresAt;
}

/** Failed /link attempts in the last hour; at the limit, further attempts are refused. */
export function failedAttemptsAllowed(timestamps: number[], now: number): { allowed: boolean; kept: number[] } {
  const kept = timestamps.filter((t) => now - t < HOUR_MS);
  return { allowed: kept.length < MAX_FAILED_LINKS_PER_HOUR, kept };
}
