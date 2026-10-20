import { describe, expect, it } from "vitest";
import {
  LINK_CODE_TTL_MS, MAX_FAILED_LINKS_PER_HOUR, codeUsable, failedAttemptsAllowed, hashJid, newLinkCode, normalizeCode,
} from "./linkCore";

describe("linkCore", () => {
  it("constants", () => {
    expect(LINK_CODE_TTL_MS).toBe(600_000);
    expect(MAX_FAILED_LINKS_PER_HOUR).toBe(5);
  });
  it("newLinkCode: 6 chars from the unambiguous alphabet", () => {
    let i = 0;
    const code = newLinkCode(() => i++);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(code).toBe("ABCDEF");
  });
  it("hashJid is stable, hex, case-insensitive and salted", () => {
    const a = hashJid("salt", "6281@s.whatsapp.net");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashJid("salt", " 6281@S.WhatsApp.net ")).toBe(a);
    expect(hashJid("other", "6281@s.whatsapp.net")).not.toBe(a);
  });
  it("normalizeCode", () => expect(normalizeCode(" abc 123 ")).toBe("ABC123"));
  it("codeUsable", () => {
    expect(codeUsable(undefined, 0)).toBe(false);
    expect(codeUsable({ expiresAt: 100 }, 100)).toBe(false);
    expect(codeUsable({ expiresAt: 100 }, 99)).toBe(true);
  });
  it("failedAttemptsAllowed keeps only the last hour", () => {
    const now = 10 * 3_600_000;
    const recent = [1, 2, 3, 4].map((n) => now - n * 60_000);
    expect(failedAttemptsAllowed(recent, now).allowed).toBe(true);
    expect(failedAttemptsAllowed([...recent, now - 1000], now).allowed).toBe(false);
    const old = [now - 2 * 3_600_000, ...recent];
    const r = failedAttemptsAllowed(old, now);
    expect(r.allowed).toBe(true);
    expect(r.kept).toEqual(recent);
  });
});
