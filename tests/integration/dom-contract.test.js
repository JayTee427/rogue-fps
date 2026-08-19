import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Deleting the progress screen left `$("#btnProgClose").addEventListener(...)`
// behind. That throws at module scope, so main.js never finished evaluating and
// the whole game failed to start - from removing a screen nothing else used.
// Nothing in the unit suites can see this: it is a contract between two files.

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const html = readFileSync(join(ROOT, "index.html"), "utf-8");
const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));

function gameSource() {
  const dir = join(ROOT, "src", "game");
  return readdirSync(dir).filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(dir, f), "utf-8")).join("\n");
}

describe("the game only talks to elements that exist", () => {
  const src = gameSource();

  it("every element it binds a listener to is in index.html", () => {
    const bound = [...src.matchAll(/\$\("#([\w-]+)"\)\.addEventListener/g)].map((m) => m[1]);
    const missing = [...new Set(bound)].filter((id) => !ids.has(id));
    expect(missing, `bound but not in index.html: ${missing.join(", ")}`).toEqual([]);
  });

  it("every element it shows as a screen is in index.html", () => {
    const shown = [...src.matchAll(/show\("#([\w-]+)"\)/g)].map((m) => m[1]);
    const missing = [...new Set(shown)].filter((id) => !ids.has(id));
    expect(missing, `shown but not in index.html: ${missing.join(", ")}`).toEqual([]);
  });

  it("found a plausible number of ids, so the scan itself is working", () => {
    expect(ids.size).toBeGreaterThan(25);
  });
});
