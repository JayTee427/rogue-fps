import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { CHALLENGES, rollChallenge, checkChallenge, challengeProgress } from "core/challenges.js";

const R = (s = 4) => rng(s);
const baseStats = { kills: 0, headshots: 0, damageTaken: 0, reloads: 0, secs: 0, dashes: 0, shotsFired: 0, shotsHit: 0, itemsTaken: 0 };

describe("CHALLENGES", () => {
  it("has at least 8 entries, each fully described", () => {
    const keys = Object.keys(CHALLENGES);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) {
      const c = CHALLENGES[k];
      expect(c.id, `${k} id`).toBe(k);
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(typeof c.desc).toBe("string");
      expect(c.desc.length).toBeGreaterThan(0);
      expect(typeof c.minFloor).toBe("number");
      expect(c.minFloor).toBeGreaterThanOrEqual(1);
      expect(["gold", "item", "heal", "reroll"]).toContain(c.reward);
      expect(typeof c.rewardAmount).toBe("number");
      expect(c.rewardAmount).toBeGreaterThan(0);
    }
  });

  it("names are unique", () => {
    const names = Object.values(CHALLENGES).map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("rollChallenge", () => {
  it("returns a challenge object from the table", () => {
    const c = rollChallenge(R(), 3);
    expect(CHALLENGES[c.id]).toBeDefined();
  });

  it("never offers one gated above the current floor", () => {
    for (let s = 0; s < 60; s++) {
      for (const floor of [1, 2, 3, 4, 5]) {
        const c = rollChallenge(R(s), floor);
        if (c) expect(c.minFloor).toBeLessThanOrEqual(floor);
      }
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(rollChallenge(R(21), 4)).toEqual(rollChallenge(R(21), 4));
    const ids = new Set();
    for (let s = 0; s < 40; s++) ids.add(rollChallenge(R(s), 5)?.id);
    expect(ids.size).toBeGreaterThan(2);
  });

  it("excludes ids passed in the optional exclude list", () => {
    const all = Object.keys(CHALLENGES).filter(k => CHALLENGES[k].minFloor <= 5);
    const exclude = all.slice(0, all.length - 1);
    for (let s = 0; s < 20; s++) {
      const c = rollChallenge(R(s), 5, exclude);
      if (c) expect(exclude).not.toContain(c.id);
    }
  });
});

describe("checkChallenge", () => {
  it("every challenge in the table can be both failed and passed", () => {
    // A challenge that can never be satisfied, or is satisfied by doing nothing,
    // is not a challenge. Each must discriminate between a bad run and a good one.
    const lazy = { ...baseStats };
    const heroic = { kills: 40, headshots: 30, damageTaken: 0, reloads: 0, secs: 12, dashes: 25, shotsFired: 40, shotsHit: 40, itemsTaken: 4 };
    for (const k of Object.keys(CHALLENGES)) {
      const a = checkChallenge(CHALLENGES[k], lazy);
      const b = checkChallenge(CHALLENGES[k], heroic);
      expect(typeof a, `${k} on a lazy room`).toBe("boolean");
      expect(typeof b, `${k} on a heroic room`).toBe("boolean");
      expect(a === b ? `${k} gives the same verdict for both` : "ok").toBe("ok");
    }
  });

  it("does not mutate the stats it inspects", () => {
    const stats = { ...baseStats, kills: 5 };
    const copy = { ...stats };
    for (const k of Object.keys(CHALLENGES)) checkChallenge(CHALLENGES[k], stats);
    expect(stats).toEqual(copy);
  });

  it("tolerates missing stat fields instead of throwing", () => {
    for (const k of Object.keys(CHALLENGES)) {
      expect(() => checkChallenge(CHALLENGES[k], {})).not.toThrow();
      expect(typeof checkChallenge(CHALLENGES[k], {})).toBe("boolean");
    }
  });
});

describe("challengeProgress", () => {
  it("returns a 0..1 fraction and a human string", () => {
    for (const k of Object.keys(CHALLENGES)) {
      const p = challengeProgress(CHALLENGES[k], { ...baseStats, kills: 3, headshots: 2, dashes: 2, secs: 5 });
      expect(p.frac).toBeGreaterThanOrEqual(0);
      expect(p.frac).toBeLessThanOrEqual(1);
      expect(typeof p.text).toBe("string");
      expect(p.text.length).toBeGreaterThan(0);
    }
  });

  it("reads 1 exactly when the challenge is met", () => {
    const heroic = { kills: 40, headshots: 30, damageTaken: 0, reloads: 0, secs: 12, dashes: 25, shotsFired: 40, shotsHit: 40, itemsTaken: 4 };
    for (const k of Object.keys(CHALLENGES)) {
      if (checkChallenge(CHALLENGES[k], heroic)) {
        expect(challengeProgress(CHALLENGES[k], heroic).frac, k).toBe(1);
      }
    }
  });
});
