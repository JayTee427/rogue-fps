import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Every named import between core modules must actually exist on the target.
// Vitest's transform is lenient about a missing named export; the browser is
// not, and one unused `import { RNG }` (the export is `rng`) took the whole game
// down at boot while all 229 tests were green. This makes that a test failure.

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = join(here, "..", "..", "src", "core");

function namedExports(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  return names;
}

describe("core module imports resolve", () => {
  const files = readdirSync(coreDir).filter(f => f.endsWith(".js"));
  const exportsOf = Object.fromEntries(files.map(f => [f, namedExports(readFileSync(join(coreDir, f), "utf-8"))]));

  for (const f of files) {
    it(`${f} imports only real named exports from core siblings`, () => {
      const src = readFileSync(join(coreDir, f), "utf-8");
      for (const m of src.matchAll(/^import\s*\{([^}]+)\}\s*from\s*["']core\/([\w-]+\.js)["']/gm)) {
        const target = m[2];
        expect(exportsOf[target], `${f} imports from missing module ${target}`).toBeDefined();
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (!name) continue;
          expect(exportsOf[target].has(name), `${f} imports '${name}' from ${target}, which exports [${[...exportsOf[target]].join(", ")}]`).toBe(true);
        }
      }
    });
  }

  it("no core module imports from src/game or three or the DOM", () => {
    for (const f of files) {
      const src = readFileSync(join(coreDir, f), "utf-8");
      expect(src, f).not.toMatch(/from\s+["'](three|game\/|\.\.\/game)/);
      expect(src, f).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\b/);
      expect(src, f).not.toMatch(/Math\.random\s*\(/);
    }
  });
});
