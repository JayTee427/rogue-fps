import { describe, it, expect } from "vitest";
import { dailySeed, formatSeed, parseSeed } from "core/daily.js";

describe("dailySeed", () => {
  it("same calendar day gives the same seed regardless of time", () => {
    const a = dailySeed(new Date(Date.UTC(2026, 7, 13, 0, 0, 1)));
    const b = dailySeed(new Date(Date.UTC(2026, 7, 13, 23, 59, 59)));
    expect(a).toBe(b);
  });

  it("different days give different seeds", () => {
    const a = dailySeed(new Date(Date.UTC(2026, 7, 13)));
    const b = dailySeed(new Date(Date.UTC(2026, 7, 14)));
    expect(a).not.toBe(b);
  });

  it("returns a non-negative 32-bit integer", () => {
    for (let d = 1; d <= 28; d++) {
      const s = dailySeed(new Date(Date.UTC(2026, 0, d)));
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });

  it("uses UTC date so every player worldwide gets the same daily", () => {
    // 2026-08-13T23:30 in UTC-8 is 2026-08-14T07:30Z -> should match the 14th
    const local = new Date("2026-08-13T23:30:00-08:00");
    expect(dailySeed(local)).toBe(dailySeed(new Date(Date.UTC(2026, 7, 14))));
  });

  it("consecutive days are not consecutive seeds (it is hashed, not day-count)", () => {
    const a = dailySeed(new Date(Date.UTC(2026, 7, 13)));
    const b = dailySeed(new Date(Date.UTC(2026, 7, 14)));
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });

  it("defaults to today when called with no argument", () => {
    expect(dailySeed()).toBe(dailySeed(new Date()));
  });
});

describe("formatSeed / parseSeed", () => {
  it("round-trips any 32-bit seed", () => {
    for (const s of [0, 1, 42, 7734, 123456789, 2 ** 32 - 1]) {
      expect(parseSeed(formatSeed(s))).toBe(s);
    }
  });

  it("formatSeed produces a short shareable string of uppercase letters and digits", () => {
    const f = formatSeed(7734);
    expect(f).toMatch(/^[A-Z0-9]+$/);
    expect(f.length).toBeLessThanOrEqual(8);
  });

  it("parseSeed is case-insensitive and tolerates surrounding whitespace", () => {
    const f = formatSeed(98765);
    expect(parseSeed(f.toLowerCase())).toBe(98765);
    expect(parseSeed(`  ${f}  `)).toBe(98765);
  });

  it("parseSeed always decodes base-36 — digits-only strings are NOT special-cased as decimal", () => {
    // formatSeed can legitimately produce all-digit codes (e.g. seed 5 -> "5"),
    // so a decimal special case would break the round-trip.
    expect(parseSeed("10")).toBe(36);
    expect(parseSeed(formatSeed(5))).toBe(5);
  });

  it("parseSeed returns null for garbage", () => {
    expect(parseSeed("")).toBeNull();
    expect(parseSeed("!!!")).toBeNull();
    expect(parseSeed("hello world")).toBeNull();
  });
});
