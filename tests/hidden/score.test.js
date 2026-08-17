import { describe, it, expect } from "vitest";
import { scoreRun, STYLE_BONUSES } from "core/score.js";

const R = (over = {}) => ({
  floor: 1, depthReached: 1, kills: 0, roomsCleared: 0, held: [], hp: 100, maxHp: 100,
  stats: {}, phase: "floor_start", ...over,
});

describe("scoreRun", () => {
  it("returns { total, breakdown } with numeric total >= 0", () => {
    const s = scoreRun(R());
    expect(typeof s.total).toBe("number");
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.breakdown && typeof s.breakdown).toBe("object");
  });

  it("a fresh run scores 0", () => {
    expect(scoreRun(R()).total).toBe(0);
  });

  it("kills add score", () => {
    expect(scoreRun(R({ kills: 10 })).total).toBeGreaterThan(scoreRun(R({ kills: 5 })).total);
  });

  it("rooms cleared add score", () => {
    expect(scoreRun(R({ roomsCleared: 5 })).total).toBeGreaterThan(scoreRun(R({ roomsCleared: 2 })).total);
  });

  it("depth is a MULTIPLIER, not an add: same kills, deeper floor, more than proportionally more score", () => {
    const f1 = scoreRun(R({ kills: 20, roomsCleared: 5, depthReached: 1 })).total;
    const f2 = scoreRun(R({ kills: 20, roomsCleared: 5, depthReached: 2 })).total;
    const f3 = scoreRun(R({ kills: 20, roomsCleared: 5, depthReached: 3 })).total;
    expect(f2).toBeGreaterThan(f1 * 1.4);
    expect(f3 - f2).toBeGreaterThanOrEqual(f2 - f1);
  });

  it("depth multiplier is exposed in the breakdown", () => {
    expect(scoreRun(R({ kills: 1, depthReached: 3 })).breakdown.depthMult).toBeGreaterThan(1);
    expect(scoreRun(R({ kills: 1, depthReached: 1 })).breakdown.depthMult).toBe(1);
  });

  it("total is an integer", () => {
    for (let k = 0; k < 20; k++) expect(Number.isInteger(scoreRun(R({ kills: k, roomsCleared: k % 5, depthReached: 1 + k % 4 })).total)).toBe(true);
  });

  it("STYLE_BONUSES is a non-empty table of { id, name, points } and each id is unique", () => {
    expect(STYLE_BONUSES.length).toBeGreaterThanOrEqual(5);
    const ids = STYLE_BONUSES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of STYLE_BONUSES) {
      expect(typeof b.name).toBe("string");
      expect(b.points).toBeGreaterThan(0);
    }
  });

  it("the named style bonuses pay out when their condition holds", () => {
    // untouchable: full hp at end; hoarder: 10+ items; pacifist-ish: cleared rooms with 0 kills
    const untouched = scoreRun(R({ roomsCleared: 5, hp: 100, maxHp: 100 }));
    const hurt = scoreRun(R({ roomsCleared: 5, hp: 40, maxHp: 100 }));
    expect(untouched.total).toBeGreaterThan(hurt.total);
    expect(untouched.breakdown.bonuses.some(b => b.id === "untouchable")).toBe(true);
    expect(hurt.breakdown.bonuses.some(b => b.id === "untouchable")).toBe(false);

    const hoard = scoreRun(R({ held: new Array(10).fill("hot_rounds"), roomsCleared: 1 }));
    expect(hoard.breakdown.bonuses.some(b => b.id === "hoarder")).toBe(true);
  });

  it("holding cursed items grants a 'cursed' style bonus", () => {
    const s = scoreRun(R({ held: ["berserker_pact"], roomsCleared: 1, kills: 1 }));
    expect(s.breakdown.bonuses.some(b => b.id === "cursed")).toBe(true);
  });

  it("does not mutate the run", () => {
    const r = R({ kills: 3 });
    const before = JSON.stringify(r);
    scoreRun(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});
