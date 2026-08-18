import { describe, it, expect } from "vitest";
import { ACHIEVEMENTS, checkAchievements, achievementProgress, newAchievementState } from "core/achievements.js";

const summary = (o = {}) => ({ floorsCleared: 2, roomsCleared: 10, kills: 60, bossesKilled: 1, extracted: false,
  score: 2000, itemsHeld: [], secs: 400, damageTaken: 200, headshots: 10, curses: 0, synergies: 0, ...o });

describe("ACHIEVEMENTS", () => {
  it("defines at least 12, each fully described", () => {
    const keys = Object.keys(ACHIEVEMENTS);
    expect(keys.length).toBeGreaterThanOrEqual(12);
    for (const k of keys) {
      const a = ACHIEVEMENTS[k];
      expect(a.id, `${k} id`).toBe(k);
      expect(typeof a.name).toBe("string");
      expect(a.name.length).toBeGreaterThan(0);
      expect(typeof a.desc).toBe("string");
      expect(a.desc.length).toBeGreaterThan(0);
      expect(["bronze", "silver", "gold"]).toContain(a.tier);
      expect(typeof a.test).toBe("function");
    }
  });

  it("names are unique", () => {
    const names = Object.values(ACHIEVEMENTS).map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has a spread of tiers, not all one difficulty", () => {
    const tiers = new Set(Object.values(ACHIEVEMENTS).map((a) => a.tier));
    expect(tiers.size).toBeGreaterThanOrEqual(2);
  });

  it("every achievement can be both earned and not earned", () => {
    const nothing = summary({ floorsCleared: 0, roomsCleared: 0, kills: 0, bossesKilled: 0, score: 0, secs: 0, damageTaken: 0, headshots: 0 });
    const everything = summary({ floorsCleared: 9, roomsCleared: 50, kills: 999, bossesKilled: 9, extracted: true,
      score: 999999, itemsHeld: Array(20).fill("x"), secs: 60, damageTaken: 0, headshots: 500, curses: 5, synergies: 5 });
    for (const k of Object.keys(ACHIEVEMENTS)) {
      const a = ACHIEVEMENTS[k].test(nothing);
      const b = ACHIEVEMENTS[k].test(everything);
      expect(typeof a, `${k} on an empty run`).toBe("boolean");
      expect(typeof b, `${k} on a perfect run`).toBe("boolean");
      expect(a === b ? `${k} gives the same verdict for both` : "ok").toBe("ok");
    }
  });

  it("no test throws on a completely empty summary", () => {
    for (const k of Object.keys(ACHIEVEMENTS)) {
      expect(() => ACHIEVEMENTS[k].test({}), k).not.toThrow();
      expect(typeof ACHIEVEMENTS[k].test({})).toBe("boolean");
    }
  });
});

describe("newAchievementState", () => {
  it("starts with nothing earned and is fresh each call", () => {
    const s = newAchievementState();
    expect(Array.isArray(s.earned)).toBe(true);
    expect(s.earned).toEqual([]);
    s.earned.push("x");
    expect(newAchievementState().earned).toEqual([]);
  });
});

describe("checkAchievements", () => {
  it("reports newly earned ids without duplicating or losing any", () => {
    let st = newAchievementState();
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const r = checkAchievements(st, summary({ kills: 999, score: 99999, bossesKilled: 5, extracted: true, floorsCleared: 9 }));
      seen.push(...r.newly);
      expect(r.state.earned.length).toBeGreaterThanOrEqual(st.earned.length);
      st = r.state;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(st.earned).size).toBe(st.earned.length);
  });

  it("never mutates the state it is given", () => {
    const st = newAchievementState();
    const copy = JSON.stringify(st);
    checkAchievements(st, summary({ kills: 999 }));
    expect(JSON.stringify(st)).toBe(copy);
  });

  it("every newly earned id is a real achievement", () => {
    const r = checkAchievements(newAchievementState(), summary({ kills: 999, score: 99999, extracted: true, bossesKilled: 9, floorsCleared: 9 }));
    for (const id of r.newly) expect(ACHIEVEMENTS[id], `unknown achievement ${id}`).toBeDefined();
  });

  it("earns nothing from a do-nothing run", () => {
    const r = checkAchievements(newAchievementState(), summary({ floorsCleared: 0, roomsCleared: 0, kills: 0, bossesKilled: 0, score: 0, extracted: false, headshots: 0 }));
    expect(r.newly).toEqual([]);
  });

  it("survives a junk summary", () => {
    expect(() => checkAchievements(newAchievementState(), {})).not.toThrow();
    expect(() => checkAchievements(newAchievementState(), null)).not.toThrow();
  });
});

describe("achievementProgress", () => {
  it("reports counts that make sense", () => {
    const p = achievementProgress(newAchievementState());
    expect(p.earned).toBe(0);
    expect(p.total).toBe(Object.keys(ACHIEVEMENTS).length);
    expect(typeof p.text).toBe("string");
    expect(p.text.length).toBeGreaterThan(0);
  });
});
