import { createHash, randomInt, timingSafeEqual } from "node:crypto";

// Email one-time sign-in codes. Pure helpers, unit-tested.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Bound to the user and a server secret, so a leaked table row is useless on its own. */
export function hashCode(userId: string, code: string, secret: string): string {
  return createHash("sha256").update(`${userId}:${code}:${secret}`).digest("hex");
}

export function codeMatches(userId: string, code: string, secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(userId, code.trim(), secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CodeState = "OK" | "EXPIRED" | "USED" | "LOCKED";

export function codeState(c: { expiresAt: Date; usedAt: Date | null; attempts: number }, now: Date): CodeState {
  if (c.usedAt) return "USED";
  if (c.expiresAt <= now) return "EXPIRED";
  if (c.attempts >= MAX_ATTEMPTS) return "LOCKED";
  return "OK";
}
