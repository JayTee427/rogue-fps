import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { ROOM_EVENTS, rollEvent, resolveEvent, eventDanger } from "core/events.js";

const R = (s = 4) => rng(s);
const run = (o = {}) => ({ floor: 3, held: [], gold: 100, hp: 80, maxHp: 100, ...o });

describe("ROOM_EVENTS", () => {
  it("defines at least 8 events, each fully described", () => {
    const keys = Object.keys(ROOM_EVENTS);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) {
      const e = ROOM_EVENTS[k];
      expect(e.id, `${k} id`).toBe(k);
      expect(typeof e.name).toBe("string");
      expect(e.name.length).toBeGreaterThan(0);
      expect(typeof e.prompt).toBe("string");
      expect(e.prompt.length).toBeGreaterThan(10);
      expect(e.minFloor).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(e.choices)).toBe(true);
      expect(e.choices.length, `${k} needs a real decision`).toBeGreaterThanOrEqual(2);
      for (const c of e.choices) {
        expect(typeof c.label).toBe("string");
        expect(c.label.length).toBeGreaterThan(0);
        expect(typeof c.desc).toBe("string");
      }
    }
  });

  it("names are unique", () => {
    const names = Object.values(ROOM_EVENTS).map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every event offers at least one choice that is not purely a downside", () => {
    for (const k of Object.keys(ROOM_EVENTS)) {
      const outcomes = ROOM_EVENTS[k].choices.map((c, i) => resolveEvent(R(1), k, i, run()));
      const anyUpside = outcomes.some((o) => (o.gold ?? 0) > 0 || (o.heal ?? 0) > 0 || (o.grantItem ?? null) || (o.maxHp ?? 0) > 0);
      expect(anyUpside, `${k} is all downside - nobody would ever engage with it`).toBe(true);
    }
  });
});

describe("rollEvent", () => {
  it("returns a real event gated by floor, or null", () => {
    for (let s = 0; s < 40; s++) {
      for (const floor of [1, 2, 4, 7]) {
        const e = rollEvent(R(s), floor);
        if (e === null) continue;
        expect(ROOM_EVENTS[e.id], `unknown event ${e.id}`).toBeDefined();
        expect(e.minFloor).toBeLessThanOrEqual(floor);
      }
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(rollEvent(R(11), 5)).toEqual(rollEvent(R(11), 5));
    const seen = new Set();
    for (let s = 0; s < 40; s++) seen.add(rollEvent(R(s), 6)?.id ?? "none");
    expect(seen.size).toBeGreaterThan(2);
  });

  it("excludes ids passed in the optional exclude list", () => {
    const all = Object.keys(ROOM_EVENTS);
    const exclude = all.slice(0, all.length - 1);
    for (let s = 0; s < 20; s++) {
      const e = rollEvent(R(s), 8, exclude);
      if (e) expect(exclude).not.toContain(e.id);
    }
  });
});

describe("resolveEvent", () => {
  it("returns a well formed outcome for every event and every choice", () => {
    for (const k of Object.keys(ROOM_EVENTS)) {
      ROOM_EVENTS[k].choices.forEach((_, i) => {
        const o = resolveEvent(R(3), k, i, run());
        expect(typeof o.text, `${k}[${i}] has no text`).toBe("string");
        expect(o.text.length).toBeGreaterThan(0);
        for (const n of ["gold", "heal", "damage", "maxHp"]) {
          if (o[n] !== undefined) expect(Number.isFinite(o[n]), `${k}[${i}].${n}`).toBe(true);
        }
        if (o.grantItem) expect(typeof o.grantItem).toBe("string");
        if (o.spawnEnemies !== undefined) {
          expect(Number.isInteger(o.spawnEnemies)).toBe(true);
          expect(o.spawnEnemies).toBeGreaterThanOrEqual(0);
        }
      });
    }
  });

  it("never mutates the run", () => {
    const r = run({ held: ["greed"] });
    const copy = JSON.parse(JSON.stringify(r));
    for (const k of Object.keys(ROOM_EVENTS)) resolveEvent(R(2), k, 0, r);
    expect(r).toEqual(copy);
  });

  it("is deterministic per seed", () => {
    const k = Object.keys(ROOM_EVENTS)[0];
    expect(resolveEvent(R(7), k, 0, run())).toEqual(resolveEvent(R(7), k, 0, run()));
  });

  it("handles an out of range choice and an unknown event without throwing", () => {
    const k = Object.keys(ROOM_EVENTS)[0];
    for (const i of [-1, 99, null, undefined]) {
      expect(() => resolveEvent(R(1), k, i, run()), `choice ${i}`).not.toThrow();
    }
    expect(() => resolveEvent(R(1), "no_such_event", 0, run())).not.toThrow();
  });

  it("never awards an item id that does not exist", async () => {
    const { ITEM_BY_ID } = await import("core/items.js");
    for (const k of Object.keys(ROOM_EVENTS)) {
      ROOM_EVENTS[k].choices.forEach((_, i) => {
        for (let s = 0; s < 8; s++) {
          const o = resolveEvent(R(s), k, i, run());
          if (o.grantItem) expect(ITEM_BY_ID[o.grantItem], `${k}[${i}] grants unknown item ${o.grantItem}`).toBeDefined();
        }
      });
    }
  });
});

describe("eventDanger", () => {
  it("rates every event from 0 to 1", () => {
    for (const k of Object.keys(ROOM_EVENTS)) {
      const d = eventDanger(k);
      expect(Number.isFinite(d), k).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it("returns a finite number for an unknown event", () => {
    expect(Number.isFinite(eventDanger("nope"))).toBe(true);
  });
});
