import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ITEMS } from "core/items.js";
import { BASE_STATS } from "core/stats.js";
import { HANDLED as PASSIVE_HANDLED } from "core/effects.js";
import { HANDLED as TRIGGER_HANDLED } from "core/triggers.js";

// An audit found 47 of 76 items did nothing whatsoever: their effects were keyed by
// names like reviveOnDeath and slowTimeOnHit that no code read. computeStats writes
// any key it is handed, so a misnamed effect is not a weaker bonus - it is a promise
// shown to the player and never kept. Nothing catches that except this file.

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "src");
// Tables that only DECLARE effects cannot count as reading them.
const DECLARATIVE = new Set(["items.js", "stats.js", "synergy.js", "pact.js", "codex.js",
                             "effects.js", "triggers.js"]);

function consumerSource() {
  let out = "";
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".js") && !DECLARATIVE.has(f.name)) out += readFileSync(p, "utf-8");
    }
  };
  walk(SRC);
  return out;
}

// Deliberately not a regex. The first version of this used `new RegExp(`\b${key}\b`)`,
// where inside a template literal \b is the BACKSPACE character rather than a word
// boundary - so it matched nothing and reported every live item as dead.
const WORD = /[A-Za-z0-9_$]/;
function readsIdentifier(haystack, name) {
  for (let i = haystack.indexOf(name); i !== -1; i = haystack.indexOf(name, i + 1)) {
    const before = haystack[i - 1] ?? " ";
    const after = haystack[i + name.length] ?? " ";
    if (!WORD.test(before) && !WORD.test(after)) return true;
  }
  return false;
}

describe("every item does something", () => {
  const consumers = consumerSource();
  const handled = new Set([...PASSIVE_HANDLED, ...TRIGGER_HANDLED]);

  const isLive = (key) =>
    key in BASE_STATS ||                      // a stat computeStats folds into the build
    handled.has(key) ||                       // a behaviour core/effects or core/triggers implements
    readsIdentifier(consumers, key);          // read directly by the game layer

  it("the consumer scan actually found the source", () => {
    // If this ever reads 0, every item below "fails" for the wrong reason.
    expect(consumers.length).toBeGreaterThan(20000);
    expect(readsIdentifier(consumers, "floorRetry"), "known-read key not found - scan is broken").toBe(true);
  });

  for (const item of ITEMS) {
    it(`${item.id} has at least one live effect`, () => {
      const keys = Object.keys(item.effects ?? {});
      expect(keys.length, `${item.id} has no effects at all`).toBeGreaterThan(0);
      const live = keys.filter(isLive);
      expect(live.length,
        `${item.id} does nothing: none of [${keys.join(", ")}] is a stat, a handled effect, or read anywhere`
      ).toBeGreaterThan(0);
    });
  }

  it("reports how much of the item table is fully live", () => {
    const partial = ITEMS.filter((i) => Object.keys(i.effects ?? {}).some((k) => !isLive(k)));
    // Tighten this as the remaining effects get implemented; never loosen it.
    expect(partial.length,
      `items with dead effect keys: ${partial.map((i) => i.id).join(", ")}`
    ).toBeLessThanOrEqual(8);
  });
});
