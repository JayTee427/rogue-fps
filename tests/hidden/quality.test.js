import { describe, it, expect } from "vitest";
import { pickQualityTier, TIERS } from "core/quality.js";

describe("quality tiers", () => {
  it("TIERS defines low, medium, high with the render knobs", () => {
    for (const t of ["low", "medium", "high"]) {
      expect(TIERS[t]).toBeDefined();
      expect(TIERS[t].resScale).toBeGreaterThan(0);
      expect(TIERS[t].resScale).toBeLessThanOrEqual(1);
      expect(typeof TIERS[t].shadows).toBe("boolean");
      expect(TIERS[t].particles).toBeGreaterThan(0);
    }
  });

  it("tiers are ordered: low costs less than medium costs less than high", () => {
    expect(TIERS.low.resScale).toBeLessThanOrEqual(TIERS.medium.resScale);
    expect(TIERS.medium.resScale).toBeLessThanOrEqual(TIERS.high.resScale);
    expect(TIERS.low.particles).toBeLessThan(TIERS.high.particles);
    expect(TIERS.low.shadows).toBe(false);
    expect(TIERS.high.shadows).toBe(true);
  });
});

describe("pickQualityTier(benchmarkMs, hints)", () => {
  // benchmarkMs: how long a fixed startup workload took. Lower = faster device.
  it("a fast desktop benchmark picks high", () => {
    expect(pickQualityTier(4, { mobile: false })).toBe("high");
  });

  it("a slow benchmark picks low", () => {
    expect(pickQualityTier(60, { mobile: false })).toBe("low");
  });

  it("is monotone: slower never yields a higher tier", () => {
    const rank = { low: 0, medium: 1, high: 2 };
    let prev = 2;
    for (let ms = 1; ms <= 100; ms += 3) {
      const r = rank[pickQualityTier(ms, { mobile: false })];
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });

  it("mobile caps at medium even on a fast benchmark", () => {
    expect(pickQualityTier(2, { mobile: true })).not.toBe("high");
  });

  it("a low-memory hint (deviceMemory <= 2) caps at low", () => {
    expect(pickQualityTier(2, { mobile: false, deviceMemory: 2 })).toBe("low");
  });

  it("an explicit user override wins over everything", () => {
    expect(pickQualityTier(60, { mobile: true, override: "high" })).toBe("high");
    expect(pickQualityTier(2, { override: "low" })).toBe("low");
  });

  it("returns only valid tier names", () => {
    for (let ms = 0; ms < 200; ms += 7) expect(["low", "medium", "high"]).toContain(pickQualityTier(ms, {}));
  });

  it("missing hints behaves like a desktop", () => {
    expect(pickQualityTier(4)).toBe("high");
  });
});
