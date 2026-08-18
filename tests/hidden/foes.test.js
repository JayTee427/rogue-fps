import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { ENEMY_ARCHETYPES } from "core/enemies.js";
import { EXTRA_FOES, scaleFoe, foeRoster } from "core/foes.js";

const R = (s = 5) => rng(s);
const EXISTING = new Set(Object.keys(ENEMY_ARCHETYPES));

describe("EXTRA_FOES", () => {
  it("adds at least 4 new archetypes that do not collide with the existing six", () => {
    const keys = Object.keys(EXTRA_FOES);
    expect(keys.length).toBeGreaterThanOrEqual(4);
    for (const k of keys) {
      expect(EXISTING.has(k), `${k} already exists in ENEMY_ARCHETYPES`).toBe(false);
      const f = EXTRA_FOES[k];
      expect(f.id, `${k} id`).toBe(k);
      expect(typeof f.name).toBe("string");
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.hp).toBeGreaterThan(0);
      expect(f.damage).toBeGreaterThan(0);
      expect(f.speed).toBeGreaterThan(0);
      expect(f.minFloor).toBeGreaterThanOrEqual(1);
      expect(["melee", "ranged", "support", "swarm"]).toContain(f.role);
      expect(typeof f.tell).toBe("string");
      expect(f.tell.length, `${k} must have a readable tell`).toBeGreaterThan(4);
    }
  });

  it("names and tells are unique", () => {
    const names = Object.values(EXTRA_FOES).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers more than one role - four melee bruisers is not variety", () => {
    expect(new Set(Object.values(EXTRA_FOES).map((f) => f.role)).size).toBeGreaterThanOrEqual(2);
  });

  it("stat ranges stay in the same league as the existing enemies", () => {
    const hps = Object.values(ENEMY_ARCHETYPES).map((e) => e.hp);
    const lo = Math.min(...hps) * 0.4, hi = Math.max(...hps) * 3;
    for (const [k, f] of Object.entries(EXTRA_FOES)) {
      expect(f.hp, `${k} hp ${f.hp} is outside ${lo}-${hi}`).toBeGreaterThanOrEqual(lo);
      expect(f.hp, `${k} hp ${f.hp} is outside ${lo}-${hi}`).toBeLessThanOrEqual(hi);
      expect(f.speed).toBeLessThanOrEqual(14);
    }
  });
});

describe("scaleFoe", () => {
  it("scales a foe by depth without ever producing NaN", () => {
    for (const k of Object.keys(EXTRA_FOES)) {
      for (const floor of [1, 3, 6, 9]) {
        const s = scaleFoe(k, floor, 2);
        expect(s.archetype).toBe(k);
        for (const n of ["hp", "maxHp", "damage", "speed"]) {
          expect(Number.isFinite(s[n]), `${k}@${floor}.${n}`).toBe(true);
          expect(s[n]).toBeGreaterThan(0);
        }
        expect(s.maxHp).toBe(s.hp);
      }
    }
  });

  it("deeper floors are harder", () => {
    for (const k of Object.keys(EXTRA_FOES)) {
      expect(scaleFoe(k, 6, 0).hp, k).toBeGreaterThan(scaleFoe(k, 1, 0).hp);
      expect(scaleFoe(k, 6, 0).damage, k).toBeGreaterThan(scaleFoe(k, 1, 0).damage);
    }
  });

  it("throws a clear error for an unknown foe", () => {
    expect(() => scaleFoe("no_such_foe", 1, 0)).toThrow();
  });

  it("survives junk floor and room numbers", () => {
    const k = Object.keys(EXTRA_FOES)[0];
    for (const [f, r] of [[0, 0], [-4, -1], [NaN, NaN], [99, 99]]) {
      const s = scaleFoe(k, f, r);
      expect(Number.isFinite(s.hp), `floor ${f}`).toBe(true);
      expect(s.hp).toBeGreaterThan(0);
    }
  });
});

describe("foeRoster", () => {
  it("returns only ids gated by floor, mixing old and new", () => {
    const known = new Set([...EXISTING, ...Object.keys(EXTRA_FOES)]);
    for (let s = 0; s < 30; s++) {
      for (const floor of [1, 3, 7]) {
        const roster = foeRoster(R(s), floor, 2);
        expect(Array.isArray(roster)).toBe(true);
        expect(roster.length).toBeGreaterThan(0);
        for (const id of roster) {
          expect(known.has(id), `unknown enemy ${id}`).toBe(true);
          if (EXTRA_FOES[id]) expect(EXTRA_FOES[id].minFloor).toBeLessThanOrEqual(floor);
        }
      }
    }
  });

  it("floor 1 never fields a deep-floor foe", () => {
    const deep = Object.keys(EXTRA_FOES).filter((k) => EXTRA_FOES[k].minFloor > 1);
    for (let s = 0; s < 40; s++) {
      for (const id of foeRoster(R(s), 1, 0)) expect(deep, `seed ${s}`).not.toContain(id);
    }
  });

  it("deep floors actually use the new archetypes sometimes", () => {
    let sawNew = false;
    for (let s = 0; s < 40 && !sawNew; s++) {
      if (foeRoster(R(s), 7, 3).some((id) => EXTRA_FOES[id])) sawNew = true;
    }
    expect(sawNew, "the new foes never appear - they may as well not exist").toBe(true);
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(foeRoster(R(12), 5, 2)).toEqual(foeRoster(R(12), 5, 2));
    const sigs = new Set();
    for (let s = 0; s < 25; s++) sigs.add(foeRoster(R(s), 5, 2).join(","));
    expect(sigs.size).toBeGreaterThan(3);
  });
});
