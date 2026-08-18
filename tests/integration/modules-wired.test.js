import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// core/arenas.js was accepted, passed 12 tests, shipped, and was imported by nothing.
// A module that exists and is called by no one is indistinguishable from a module
// that was never written - and it passes its own suite perfectly, so nothing else
// catches it.

const here = dirname(fileURLToPath(import.meta.url));
const CORE = join(here, "..", "..", "src", "core");
const SRC = join(here, "..", "..", "src");

// Tools and data consumed elsewhere rather than by the running game.
const NOT_GAME_CODE = new Set([
  "balance.js",   // powers delegation/sweep.py, deliberately not shipped in the bundle
]);

function allSource(skip) {
  let out = "";
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".js") && f.name !== skip) out += readFileSync(p, "utf-8");
    }
  };
  walk(SRC);
  return out;
}

describe("every core module is actually used", () => {
  const modules = readdirSync(CORE).filter((f) => f.endsWith(".js") && !NOT_GAME_CODE.has(f));

  for (const file of modules) {
    it(`${file} is imported somewhere`, () => {
      const rest = allSource(file);
      const imported = rest.includes(`core/${file}`);
      expect(imported, `${file} is imported by nothing - it may as well not exist`).toBe(true);
    });
  }

  it("finds a plausible number of core modules", () => {
    expect(modules.length).toBeGreaterThan(15);
  });
});

// A room's enemy count must keep scaling with depth. Swapping the roster source to
// core/foes.js once flattened every room to two enemies on every floor, because
// foeRoster returns a fixed count and nothing asserted otherwise.
describe("room size still scales with depth", () => {
  it("deep floors field more enemies than floor 1", async () => {
    const { rollRoster } = await import("core/enemies.js");
    const { rng } = await import("core/rng.js");
    const mean = (floor) => {
      let t = 0;
      for (let s = 0; s < 40; s++) t += rollRoster(rng(s), floor, 2, {}).length;
      return t / 40;
    };
    expect(mean(6), "floor 6 rooms are no bigger than floor 1").toBeGreaterThan(mean(1));
    expect(mean(1)).toBeGreaterThan(1);
  });
});
