import { describe, it, expect } from "vitest";
import { BIOME_LORE, BOSS_LORE, DEATH_LINES, deathLineFor } from "core/codex.js";
import { HINTS, hintFor } from "core/hints.js";
import { BIOMES } from "core/arenas.js";
import { BOSSES } from "core/floor.js";
import { ENEMY_ARCHETYPES } from "core/enemies.js";
import { EXTRA_FOES } from "core/foes.js";
import { ITEMS } from "core/items.js";
import { FLAVOUR, flavourFor } from "core/codex.js";

describe("codex flavour text", () => {
  it("covers every item exactly once, with nothing invented", () => {
    const ids = ITEMS.map(i => i.id);
    for (const id of ids) expect(FLAVOUR[id], `no flavour line for ${id}`).toBeTruthy();
    for (const k of Object.keys(FLAVOUR)) expect(ids, `flavour for unknown item ${k}`).toContain(k);
  });

  it("lines are one sentence long, not paragraphs and not stubs", () => {
    for (const [id, line] of Object.entries(FLAVOUR)) {
      expect(typeof line, id).toBe("string");
      expect(line.length, `${id}: "${line}"`).toBeGreaterThanOrEqual(12);
      expect(line.length, `${id}: "${line}"`).toBeLessThanOrEqual(90);
      expect(line, id).not.toMatch(/\n/);
    }
  });

  it("does not simply restate the item's own description", () => {
    for (const item of ITEMS) {
      const f = FLAVOUR[item.id];
      if (f && item.desc) expect(f.toLowerCase(), item.id).not.toBe(item.desc.toLowerCase());
    }
  });

  it("lines are distinct — no copy-paste filler", () => {
    const vals = Object.values(FLAVOUR);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it("flavourFor is total: a string for anything, no throw", () => {
    expect(flavourFor(ITEMS[0].id)).toBe(FLAVOUR[ITEMS[0].id]);
    expect(flavourFor("no_such_item")).toBe("");
    expect(flavourFor(undefined)).toBe("");
    expect(flavourFor(null)).toBe("");
  });
});

describe("the world has a voice everywhere the player meets it", () => {
  it("every biome has lore", () => {
    for (const id of Object.keys(BIOMES)) {
      expect(typeof BIOME_LORE[id], `biome ${id} has no lore`).toBe("string");
      expect(BIOME_LORE[id].length).toBeGreaterThan(10);
    }
  });

  it("every boss has lore", () => {
    for (const id of Object.keys(BOSSES)) {
      expect(typeof BOSS_LORE[id], `boss ${id} has no lore`).toBe("string");
    }
  });

  it("every enemy that can kill you has a death line", () => {
    for (const id of [...Object.keys(ENEMY_ARCHETYPES), ...Object.keys(EXTRA_FOES)]) {
      expect(typeof DEATH_LINES[id], `no death line for ${id}`).toBe("string");
    }
    expect(deathLineFor("melee:skitter")).toBe(DEATH_LINES.skitter);
    expect(deathLineFor("beam")).toBe(DEATH_LINES.beam);
    // an unknown source never crashes the report screen
    expect(typeof deathLineFor("something_new")).toBe("string");
    expect(typeof deathLineFor(null)).toBe("string");
  });

  it("every enemy has a first-encounter hint, and hints stay terse", () => {
    for (const id of [...Object.keys(ENEMY_ARCHETYPES), ...Object.keys(EXTRA_FOES)]) {
      expect(typeof HINTS[id], `no hint for ${id}`).toBe("string");
    }
    for (const [id, line] of Object.entries(HINTS)) {
      expect(line.length, `hint ${id} rambles (${line.length} chars)`).toBeLessThanOrEqual(90);
    }
    expect(hintFor("nonsense")).toBe(null);
  });
});
