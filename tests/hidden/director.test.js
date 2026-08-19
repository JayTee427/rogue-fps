import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { planEncounter, updateSkill, DIFFICULTY_BANDS } from "core/director.js";

const R = (s = 7) => rng(s);
const roster = ["skitter", "skitter", "sentinel", "brute", "popper", "wisp", "warden", "skitter"];

describe("DIFFICULTY_BANDS", () => {
  it("covers 0..1 with no gaps and is ordered", () => {
    expect(Array.isArray(DIFFICULTY_BANDS)).toBe(true);
    expect(DIFFICULTY_BANDS.length).toBeGreaterThanOrEqual(3);
    expect(DIFFICULTY_BANDS[0].max).toBeGreaterThan(0);
    expect(DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1].max).toBe(1);
    for (const b of DIFFICULTY_BANDS) {
      expect(typeof b.name).toBe("string");
      expect(b.max).toBeGreaterThan(0);
      expect(b.max).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < DIFFICULTY_BANDS.length; i++) {
      expect(DIFFICULTY_BANDS[i].max).toBeGreaterThan(DIFFICULTY_BANDS[i - 1].max);
    }
  });
});

describe("planEncounter", () => {
  it("splits the whole roster into waves, losing and inventing nothing", () => {
    const p = planEncounter(R(), { floor: 2, roomIndex: 1, roster, skill: 0.5 });
    const flat = p.waves.flatMap(w => w.ids);
    expect([...flat].sort()).toEqual([...roster].sort());
  });

  it("never mutates the roster it was given", () => {
    const copy = [...roster];
    planEncounter(R(), { floor: 3, roomIndex: 2, roster, skill: 0.9 });
    expect(roster).toEqual(copy);
  });

  it("is deterministic for the same seed and inputs", () => {
    const a = planEncounter(R(11), { floor: 2, roomIndex: 1, roster, skill: 0.4 });
    const b = planEncounter(R(11), { floor: 2, roomIndex: 1, roster, skill: 0.4 });
    expect(a).toEqual(b);
  });

  it("differs across seeds", () => {
    const a = planEncounter(R(1), { floor: 3, roomIndex: 3, roster, skill: 0.5 });
    const b = planEncounter(R(999), { floor: 3, roomIndex: 3, roster, skill: 0.5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("opens immediately: the first wave has zero delay and is non-empty", () => {
    for (let s = 0; s < 25; s++) {
      const p = planEncounter(R(s), { floor: 1 + (s % 5), roomIndex: s % 5, roster, skill: (s % 10) / 10 });
      expect(p.waves.length).toBeGreaterThanOrEqual(1);
      expect(p.waves[0].delay).toBe(0);
      for (const w of p.waves) {
        expect(w.ids.length).toBeGreaterThan(0);
        expect(w.delay).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(w.delay)).toBe(true);
      }
    }
  });

  it("a big roster actually arrives in stages, not all at once", () => {
    for (let s = 0; s < 20; s++) {
      const p = planEncounter(R(s), { floor: 2, roomIndex: 2, roster, skill: 0.5 });
      expect(p.waves.length, `seed ${s} produced one wave for ${roster.length} enemies`).toBeGreaterThanOrEqual(2);
      expect(p.waves[p.waves.length - 1].delay).toBeGreaterThan(0);
    }
  });

  it("later waves arrive later: delays are non-decreasing", () => {
    for (let s = 0; s < 20; s++) {
      const p = planEncounter(R(s), { floor: 3, roomIndex: 2, roster, skill: 0.5 });
      for (let i = 1; i < p.waves.length; i++) {
        expect(p.waves[i].delay).toBeGreaterThanOrEqual(p.waves[i - 1].delay);
      }
    }
  });

  it("a skilled player gets waves sooner than a struggling one, on average", () => {
    const mean = (skill) => {
      let tot = 0, n = 0;
      for (let s = 0; s < 40; s++) {
        const p = planEncounter(R(s), { floor: 3, roomIndex: 2, roster, skill });
        tot += p.waves[p.waves.length - 1].delay; n++;
      }
      return tot / n;
    };
    expect(mean(0.95)).toBeLessThan(mean(0.05));
  });

  it("reports the band it planned for, and it matches the skill", () => {
    for (const skill of [0, 0.15, 0.5, 0.85, 1]) {
      const p = planEncounter(R(3), { floor: 2, roomIndex: 1, roster, skill });
      const expected = DIFFICULTY_BANDS.find(b => skill <= b.max) ?? DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1];
      expect(p.band).toBe(expected.name);
    }
  });

  it("a single-enemy roster is one wave", () => {
    const p = planEncounter(R(5), { floor: 1, roomIndex: 0, roster: ["skitter"], skill: 0.5 });
    expect(p.waves.length).toBe(1);
    expect(p.waves[0].ids).toEqual(["skitter"]);
  });

  it("an empty roster yields no waves rather than throwing", () => {
    const p = planEncounter(R(5), { floor: 1, roomIndex: 0, roster: [], skill: 0.5 });
    expect(p.waves).toEqual([]);
  });

  it("clamps a skill outside 0..1 instead of producing nonsense", () => {
    for (const skill of [-5, 1.7, NaN]) {
      const p = planEncounter(R(2), { floor: 2, roomIndex: 1, roster, skill });
      expect(p.waves.flatMap(w => w.ids).length).toBe(roster.length);
      for (const w of p.waves) expect(Number.isFinite(w.delay)).toBe(true);
    }
  });

  it("room 0 of floor 1 does not open with a wall of enemies", () => {
    for (let s = 0; s < 30; s++) {
      const p = planEncounter(R(s), { floor: 1, roomIndex: 0, roster, skill: 0.5 });
      expect(p.waves[0].ids.length).toBeLessThanOrEqual(Math.ceil(roster.length / 2));
    }
  });
});

describe("updateSkill", () => {
  it("returns a number in 0..1", () => {
    for (const perf of [
      { clearedSecs: 5, damageTaken: 0, accuracy: 0.9 },
      { clearedSecs: 300, damageTaken: 500, accuracy: 0.02 },
      { clearedSecs: 40, damageTaken: 40, accuracy: 0.5 },
    ]) {
      const v = updateSkill(0.5, perf);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("rises after a clean fast clear and falls after a slow bloody one", () => {
    const good = updateSkill(0.5, { clearedSecs: 8, damageTaken: 0, accuracy: 0.85 });
    const bad = updateSkill(0.5, { clearedSecs: 120, damageTaken: 260, accuracy: 0.1 });
    expect(good).toBeGreaterThan(0.5);
    expect(bad).toBeLessThan(0.5);
  });

  it("moves gradually — one room never swings it more than 0.25", () => {
    const good = updateSkill(0.5, { clearedSecs: 1, damageTaken: 0, accuracy: 1 });
    const bad = updateSkill(0.5, { clearedSecs: 999, damageTaken: 9999, accuracy: 0 });
    expect(Math.abs(good - 0.5)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(bad - 0.5)).toBeLessThanOrEqual(0.25);
  });

  it("stays in range at the extremes and survives junk input", () => {
    expect(updateSkill(1, { clearedSecs: 1, damageTaken: 0, accuracy: 1 })).toBeLessThanOrEqual(1);
    expect(updateSkill(0, { clearedSecs: 999, damageTaken: 999, accuracy: 0 })).toBeGreaterThanOrEqual(0);
    const j = updateSkill(0.5, {});
    expect(Number.isFinite(j)).toBe(true);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(1);
  });

  it("does not mutate the perf object", () => {
    const perf = { clearedSecs: 20, damageTaken: 10, accuracy: 0.5 };
    const copy = { ...perf };
    updateSkill(0.5, perf);
    expect(perf).toEqual(copy);
  });
});

describe("first-room wave split survives every wave count", () => {
  it("a 3-enemy opener never crashes and never loses an enemy", () => {
    // n=3 rolls a single wave on a coin flip, and the first-room cap then
    // overflows into waves[1] - which did not exist. Half of all new runs
    // crashed at first spawn, silently, from the moment the room-1 roster was
    // trimmed to three. Sweep seeds so both branches are exercised.
    for (let seed = 1; seed <= 60; seed++) {
      const plan = planEncounter(rng(seed).fork("director"), {
        floor: 1, roomIndex: 0, roster: ["skitter", "skitter", "sentinel"], skill: 0.5,
      });
      const all = plan.waves.flatMap((w) => w.ids);
      expect(all.length, `seed ${seed} lost enemies`).toBe(3);
      // the cap itself: no opener wave larger than ceil(n/2)
      expect(plan.waves[0].ids.length, `seed ${seed} dumped the roster`).toBeLessThanOrEqual(2);
    }
  });
});
