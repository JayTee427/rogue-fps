import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";

describe("rng — seeded PRNG", () => {
  it("same seed gives the same sequence", () => {
    const a = rng(42), b = rng(42);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).toEqual(sb);
  });

  it("different seeds give different sequences", () => {
    const a = rng(1), b = rng(2);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it("next() is in [0, 1)", () => {
    const r = rng(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("next() is roughly uniform", () => {
    const r = rng(99);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(r.next() * 10)]++;
    for (const b of buckets) {
      expect(b).toBeGreaterThan(1600);
      expect(b).toBeLessThan(2400);
    }
  });

  it("int(lo, hi) is inclusive on both ends and never outside", () => {
    const r = rng(3);
    const seen = new Set();
    for (let i = 0; i < 3000; i++) {
      const v = r.int(2, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("int(n, n) always returns n", () => {
    const r = rng(11);
    for (let i = 0; i < 50; i++) expect(r.int(9, 9)).toBe(9);
  });

  it("pick returns elements of the array and reaches every element", () => {
    const r = rng(5);
    const arr = ["a", "b", "c", "d"];
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const v = r.pick(arr);
      expect(arr).toContain(v);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
  });

  it("chance(0) is never true and chance(1) is always true", () => {
    const r = rng(8);
    for (let i = 0; i < 200; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it("chance(p) is roughly p", () => {
    const r = rng(13);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (r.chance(0.3)) hits++;
    expect(hits).toBeGreaterThan(2700);
    expect(hits).toBeLessThan(3300);
  });

  it("shuffle returns a permutation and does not mutate the input", () => {
    const r = rng(21);
    const arr = [1, 2, 3, 4, 5, 6];
    const copy = arr.slice();
    const out = r.shuffle(arr);
    expect(arr).toEqual(copy);
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("shuffle actually reorders (across many trials it is not always identity)", () => {
    const r = rng(22);
    let identity = 0;
    for (let i = 0; i < 100; i++) {
      const out = r.shuffle([1, 2, 3, 4, 5]);
      if (out.join() === "1,2,3,4,5") identity++;
    }
    expect(identity).toBeLessThan(10);
  });

  it("fork(label) is deterministic: same seed + same label = same stream", () => {
    const fa = rng(100).fork("items"), fb = rng(100).fork("items");
    const sa = Array.from({ length: 10 }, () => fa.next());
    const sb = Array.from({ length: 10 }, () => fb.next());
    expect(sa).toEqual(sb);
  });

  it("fork(label) depends ONLY on the seed and label, not on parent draws", () => {
    // This is what makes systems independent: generating the floor first must
    // not change which items the reward draft rolls.
    const untouched = rng(100).fork("items");
    const consumed = rng(100);
    consumed.next(); consumed.next(); consumed.next();
    const afterDraws = consumed.fork("items");
    expect(afterDraws.next()).toBe(untouched.next());
  });

  it("drawing from a fork does not advance the parent", () => {
    const a = rng(555), b = rng(555);
    a.fork("x").next(); a.fork("x").next();
    expect(a.next()).toBe(b.next());
  });

  it("different fork labels give different streams", () => {
    const r = rng(100);
    const x = r.fork("floor").next();
    const y = rng(100).fork("enemies").next();
    expect(x).not.toBe(y);
  });

  it("accepts a numeric string seed", () => {
    const a = rng("12345"), b = rng(12345);
    expect(a.next()).toBe(b.next());
  });
});
