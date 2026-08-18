import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { BIOMES, pickBiome, biomePalette, biomeLayout } from "core/arenas.js";

const R = (s = 5) => rng(s);
const hex = (v) => typeof v === "number" && v >= 0 && v <= 0xffffff;

describe("BIOMES", () => {
  it("defines at least 4 distinct station environments", () => {
    const keys = Object.keys(BIOMES);
    expect(keys.length).toBeGreaterThanOrEqual(4);
    for (const k of keys) {
      const b = BIOMES[k];
      expect(b.id, `${k} id`).toBe(k);
      expect(typeof b.name).toBe("string");
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.minFloor).toBeGreaterThanOrEqual(1);
      expect(typeof b.desc).toBe("string");
    }
  });

  it("names are unique and at least one biome is available on floor 1", () => {
    const names = Object.values(BIOMES).map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.values(BIOMES).some((b) => b.minFloor === 1)).toBe(true);
  });
});

describe("biomePalette", () => {
  it("gives every biome a full set of real colours", () => {
    for (const k of Object.keys(BIOMES)) {
      const p = biomePalette(k);
      for (const c of ["floor", "wall", "trim", "fog", "sky", "accent"]) {
        expect(hex(p[c]), `${k}.${c} = ${p[c]}`).toBe(true);
      }
      expect(p.fogDensity).toBeGreaterThan(0);
      expect(p.fogDensity).toBeLessThan(0.5);
      expect(p.lightIntensity).toBeGreaterThan(0);
    }
  });

  it("biomes actually look different from one another", () => {
    const sigs = Object.keys(BIOMES).map((k) => {
      const p = biomePalette(k);
      return `${p.floor}-${p.wall}-${p.trim}-${p.fog}`;
    });
    expect(new Set(sigs).size, "two biomes share an identical palette").toBe(sigs.length);
  });

  it("floor and wall are never the same colour - the room must read as a room", () => {
    for (const k of Object.keys(BIOMES)) {
      const p = biomePalette(k);
      expect(p.floor, k).not.toBe(p.wall);
    }
  });

  it("falls back to a valid palette for an unknown biome instead of throwing", () => {
    expect(() => biomePalette("nope")).not.toThrow();
    expect(hex(biomePalette("nope").floor)).toBe(true);
  });
});

describe("biomeLayout", () => {
  it("returns arena dimensions and cover counts within playable bounds", () => {
    for (const k of Object.keys(BIOMES)) {
      for (let s = 0; s < 12; s++) {
        const l = biomeLayout(R(s), k, 1 + (s % 6));
        expect(l.halfW).toBeGreaterThanOrEqual(10);
        expect(l.halfW).toBeLessThanOrEqual(30);
        expect(l.halfD).toBeGreaterThanOrEqual(10);
        expect(l.halfD).toBeLessThanOrEqual(30);
        expect(Number.isInteger(l.blockCount)).toBe(true);
        expect(l.blockCount).toBeGreaterThanOrEqual(2);
        expect(l.blockCount).toBeLessThanOrEqual(14);
        expect(l.ceiling).toBeGreaterThan(3);
      }
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    const k = Object.keys(BIOMES)[0];
    expect(biomeLayout(R(9), k, 3)).toEqual(biomeLayout(R(9), k, 3));
    const sigs = new Set();
    for (let s = 0; s < 20; s++) sigs.add(JSON.stringify(biomeLayout(R(s), k, 3)));
    expect(sigs.size).toBeGreaterThan(2);
  });

  it("different biomes produce differently shaped rooms on the same seed", () => {
    const keys = Object.keys(BIOMES);
    const sigs = keys.map((k) => JSON.stringify(biomeLayout(R(4), k, 3)));
    expect(new Set(sigs).size, "every biome builds the same room").toBeGreaterThan(1);
  });

  it("survives an unknown biome and junk floor numbers", () => {
    for (const f of [0, -3, NaN, 99]) {
      const l = biomeLayout(R(1), "nope", f);
      expect(Number.isFinite(l.halfW), `floor ${f}`).toBe(true);
      expect(l.blockCount).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("pickBiome", () => {
  it("returns a real biome id gated by floor", () => {
    for (let s = 0; s < 40; s++) {
      for (const floor of [1, 2, 3, 5, 8]) {
        const b = pickBiome(R(s), floor);
        expect(BIOMES[b], `unknown biome ${b}`).toBeDefined();
        expect(BIOMES[b].minFloor).toBeLessThanOrEqual(floor);
      }
    }
  });

  it("is deterministic and gives variety across seeds", () => {
    expect(pickBiome(R(3), 5)).toBe(pickBiome(R(3), 5));
    const seen = new Set();
    for (let s = 0; s < 40; s++) seen.add(pickBiome(R(s), 8));
    expect(seen.size, "deep floors always pick the same biome").toBeGreaterThan(1);
  });
});
