import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BASE_STATS } from "core/stats.js";

// BASE_STATS once carried 113 entries, most of them never read by anything - the
// tail was an anatomical word list from a generation that ran on unchecked. Junk in
// a stat table is not harmless: every item effect and every synergy is keyed by
// stat name, so a table full of noise hides typos that silently do nothing.

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "src");

function allSource() {
  let out = "";
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".js") && f.name !== "stats.js") out += readFileSync(p, "utf-8");
    }
  };
  walk(SRC);
  return out;
}

describe("BASE_STATS hygiene", () => {
  it("stays a stat table, not a dictionary", () => {
    expect(Object.keys(BASE_STATS).length).toBeLessThanOrEqual(60);
  });

  it("every stat is actually read somewhere in the game", () => {
    const src = allSource();
    const orphans = Object.keys(BASE_STATS).filter((k) => !new RegExp(`\\b${k}\\b`).test(src));
    expect(orphans, `these stats are defined but never read: ${orphans.join(", ")}`).toEqual([]);
  });

  it("holds no anatomy", () => {
    const banned = ["rectum", "prostate", "uterus", "ovary", "testicle", "penis", "vagina",
                    "clitoris", "labia", "mammary", "nipple", "areola", "intestine", "bladder"];
    const found = banned.filter((b) => b in BASE_STATS);
    expect(found, `BASE_STATS contains ${found.join(", ")}`).toEqual([]);
  });

  it("still has the stats the game depends on", () => {
    for (const k of ["maxHp", "damage", "fireRate", "moveSpeed", "critChance", "critMult",
                     "draftSize", "luck", "rarityShift", "armor", "deflect"]) {
      expect(BASE_STATS[k], `missing required stat ${k}`).toBeDefined();
    }
  });
});
