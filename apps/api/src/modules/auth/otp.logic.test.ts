import { describe, expect, it } from "vitest";

import { MAX_ATTEMPTS, codeMatches, codeState, hashCode, newCode } from "./otp.logic.js";

describe("newCode", () => {
  it("is always six digits", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });
});

describe("codeMatches", () => {
  const h = hashCode("u1", "042317", "secret");
  it("accepts the right code (ignoring spaces)", () => {
    expect(codeMatches("u1", "042317", "secret", h)).toBe(true);
    expect(codeMatches("u1", " 042317 ", "secret", h)).toBe(true);
  });
  it("rejects a wrong code, another user or another secret", () => {
    expect(codeMatches("u1", "042318", "secret", h)).toBe(false);
    expect(codeMatches("u2", "042317", "secret", h)).toBe(false);
    expect(codeMatches("u1", "042317", "other", h)).toBe(false);
  });
});

describe("codeState", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const later = new Date("2026-11-11T12:05:00Z");
  it("is usable once, until it expires or is tried too often", () => {
    expect(codeState({ expiresAt: later, usedAt: null, attempts: 0 }, now)).toBe("OK");
    expect(codeState({ expiresAt: later, usedAt: now, attempts: 0 }, now)).toBe("USED");
    expect(codeState({ expiresAt: now, usedAt: null, attempts: 0 }, now)).toBe("EXPIRED");
    expect(codeState({ expiresAt: later, usedAt: null, attempts: MAX_ATTEMPTS }, now)).toBe("LOCKED");
  });
});
