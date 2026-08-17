import { describe, it, expect } from "vitest";
import { createShake, addTrauma, stepShake, sampleShake } from "core/shake.js";
import { rng } from "core/rng.js";

// Trauma-based camera shake (the technique from Squirrel Eiserloh's GDC talk):
// trauma in [0,1] decays linearly; shake magnitude = trauma^2; offsets sampled
// from smooth noise so it feels physical, not jittery.

describe("shake state", () => {
  it("createShake starts at zero trauma", () => {
    const s = createShake();
    expect(s.trauma).toBe(0);
    expect(s.t).toBe(0);
  });

  it("addTrauma accumulates and clamps to 1", () => {
    const s = createShake();
    addTrauma(s, 0.4);
    expect(s.trauma).toBeCloseTo(0.4);
    addTrauma(s, 0.9);
    expect(s.trauma).toBe(1);
  });

  it("addTrauma ignores non-positive amounts", () => {
    const s = createShake();
    addTrauma(s, -0.5);
    addTrauma(s, 0);
    expect(s.trauma).toBe(0);
  });

  it("stepShake decays trauma linearly by decayRate*dt and never below 0", () => {
    const s = createShake({ decay: 1.5 });
    addTrauma(s, 1);
    stepShake(s, 0.2);
    expect(s.trauma).toBeCloseTo(0.7);
    stepShake(s, 5);
    expect(s.trauma).toBe(0);
  });

  it("stepShake advances the time base", () => {
    const s = createShake();
    stepShake(s, 0.25);
    expect(s.t).toBeCloseTo(0.25);
  });
});

describe("sampleShake", () => {
  it("returns zero offsets at zero trauma", () => {
    const s = createShake();
    const o = sampleShake(s, rng(1));
    expect(o).toEqual({ x: 0, y: 0, roll: 0 });
  });

  it("magnitude scales with trauma SQUARED (0.5 trauma is ~1/4 the shake of 1.0)", () => {
    const big = createShake({ maxOffset: 1, maxRoll: 1 }); addTrauma(big, 1);
    const small = createShake({ maxOffset: 1, maxRoll: 1 }); addTrauma(small, 0.5);
    let sumBig = 0, sumSmall = 0;
    for (let i = 0; i < 200; i++) {
      stepShake(big, 0.016); stepShake(small, 0.016);
      big.trauma = 1; small.trauma = 0.5;                       // hold trauma constant
      const a = sampleShake(big, rng(i)), b = sampleShake(small, rng(i));
      sumBig += Math.abs(a.x) + Math.abs(a.y); sumSmall += Math.abs(b.x) + Math.abs(b.y);
    }
    const ratio = sumSmall / sumBig;
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.35);
  });

  it("offsets are bounded by maxOffset and maxRoll", () => {
    const s = createShake({ maxOffset: 0.3, maxRoll: 0.1 });
    addTrauma(s, 1);
    for (let i = 0; i < 300; i++) {
      stepShake(s, 0.016); s.trauma = 1;
      const o = sampleShake(s, rng(i));
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(Math.abs(o.roll)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });

  it("is smooth: consecutive samples at small dt do not jump wildly", () => {
    const s = createShake({ maxOffset: 1, maxRoll: 1 });
    addTrauma(s, 1);
    let prev = sampleShake(s, rng(0));
    let maxJump = 0;
    for (let i = 1; i < 120; i++) {
      stepShake(s, 0.008); s.trauma = 1;
      const o = sampleShake(s, rng(0));
      maxJump = Math.max(maxJump, Math.abs(o.x - prev.x));
      prev = o;
    }
    // white noise would jump ~1.0 between frames; smooth noise stays well under
    expect(maxJump).toBeLessThan(0.5);
  });

  it("actually shakes: over time both signs and non-trivial magnitude appear", () => {
    const s = createShake({ maxOffset: 1, maxRoll: 1 });
    addTrauma(s, 1);
    let pos = 0, neg = 0, maxAbs = 0;
    for (let i = 0; i < 300; i++) {
      stepShake(s, 0.016); s.trauma = 1;
      const o = sampleShake(s, rng(0));
      if (o.x > 0) pos++; else if (o.x < 0) neg++;
      maxAbs = Math.max(maxAbs, Math.abs(o.x));
    }
    expect(pos).toBeGreaterThan(20);
    expect(neg).toBeGreaterThan(20);
    expect(maxAbs).toBeGreaterThan(0.3);
  });

  it("does not mutate the shake state", () => {
    const s = createShake(); addTrauma(s, 0.7); stepShake(s, 0.1);
    const before = JSON.stringify(s);
    sampleShake(s, rng(1));
    expect(JSON.stringify(s)).toBe(before);
  });
});
