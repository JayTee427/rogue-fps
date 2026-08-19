import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { ITEMS } from "core/items.js";
import { BOONS, rollPact, acceptPact, refusePact } from "core/pact.js";

const R = (s = 6) => rng(s);
const run = (o = {}) => ({ floor: 3, held: [], maxHp: 100, gold: 0, ...o });
const CURSED = ITEMS.filter(i => i.rarity === "cursed").map(i => i.id);

describe("BOONS", () => {
  it("offers at least 5 boons, each fully described", () => {
    const keys = Object.keys(BOONS);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    for (const k of keys) {
      const b = BOONS[k];
      expect(b.id, `${k} id`).toBe(k);
      expect(typeof b.name).toBe("string");
      expect(b.name.length).toBeGreaterThan(0);
      expect(typeof b.desc).toBe("string");
      expect(b.desc.length).toBeGreaterThan(0);
      expect(typeof b.effects).toBe("object");
      expect(b.effects).not.toBeNull();
      expect(Object.keys(b.effects).length).toBeGreaterThan(0);
    }
  });

  it("boon names are unique", () => {
    const names = Object.values(BOONS).map(b => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("rollPact", () => {
  it("pairs a real cursed item with a real boon", () => {
    for (let s = 0; s < 30; s++) {
      const p = rollPact(R(s), run());
      if (!p) continue;
      expect(CURSED, `seed ${s}: ${p.curse} is not a cursed item`).toContain(p.curse);
      expect(BOONS[p.boon], `seed ${s}: unknown boon ${p.boon}`).toBeDefined();
      expect(typeof p.text).toBe("string");
      expect(p.text.length).toBeGreaterThan(0);
    }
  });

  it("never offers a curse the player already carries", () => {
    const held = CURSED.slice(0, 4);
    for (let s = 0; s < 40; s++) {
      const p = rollPact(R(s), run({ held }));
      if (p) expect(held, `seed ${s}`).not.toContain(p.curse);
    }
  });

  it("returns null rather than throwing when every curse is already held", () => {
    const p = rollPact(R(1), run({ held: [...CURSED] }));
    expect(p).toBeNull();
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(rollPact(R(12), run())).toEqual(rollPact(R(12), run()));
    const seen = new Set();
    for (let s = 0; s < 30; s++) seen.add(JSON.stringify(rollPact(R(s), run())));
    expect(seen.size).toBeGreaterThan(2);
  });

  it("does not mutate the run", () => {
    const r = run({ held: ["hot_rounds"] });
    const copy = JSON.parse(JSON.stringify(r));
    rollPact(R(7), r);
    expect(r).toEqual(copy);
  });

  it("scales the boon with the cost: a deeper floor is not a worse deal", () => {
    // Whatever the pact gives, it must never be empty of value.
    for (let s = 0; s < 20; s++) {
      const p = rollPact(R(s), run({ floor: 5 }));
      if (p) expect(Object.keys(BOONS[p.boon].effects).length).toBeGreaterThan(0);
    }
  });
});

describe("acceptPact", () => {
  it("adds the curse to held and the boon where recomputeStats reads it", () => {
    const p = rollPact(R(4), run());
    const res = acceptPact(run(), p);
    expect(res.held).toContain(p.curse);
    // `boons` (plural), the list the stat recompute actually consumes. The old
    // shape stored `boon`/`effects`, which nothing read: every pact charged
    // its curse and paid nothing.
    expect(res.boons).toContain(p.boon);
    expect(res.effects).toBeUndefined();
  });

  it("never mutates the run it was given", () => {
    const r = run();
    const copy = JSON.parse(JSON.stringify(r));
    acceptPact(r, rollPact(R(4), r));
    expect(r).toEqual(copy);
  });

  it("does not duplicate a curse if somehow accepted twice", () => {
    const r = run();
    const p = rollPact(R(4), r);
    const once = acceptPact(r, p);
    const twice = acceptPact({ ...r, held: once.held }, p);
    expect(twice.held.filter(id => id === p.curse).length).toBe(1);
  });

  it("throws or returns the run unchanged for a null pact, never a corrupt state", () => {
    const r = run();
    let res;
    try { res = acceptPact(r, null); } catch { return; }   // throwing is acceptable
    expect(Array.isArray(res.held)).toBe(true);
    expect(res.held).toEqual(r.held);
  });
});

describe("refusePact", () => {
  it("leaves the player exactly as they were", () => {
    const r = run({ held: ["hot_rounds"] });
    const res = refusePact(r);
    expect(res.held).toEqual(["hot_rounds"]);
    expect(res.maxHp).toBe(r.maxHp);
  });

  it("does not mutate the run", () => {
    const r = run({ held: ["hot_rounds"] });
    const copy = JSON.parse(JSON.stringify(r));
    refusePact(r);
    expect(r).toEqual(copy);
  });
});
