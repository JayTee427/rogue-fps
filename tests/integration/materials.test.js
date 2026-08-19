import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The "black square". For two weeks a screen-filling black rectangle stalked
// every playtest: present from spawn in some rooms, moving with the view but
// not quite locked to it, stepped edges, exact-zero pixels, and it survived
// seven wrong theories (viewport, composer, DOM overlays, the sky, the weapon
// model, display scaling, unwritten framebuffer).
//
// It was one material: MeshLambertMaterial{ flatShading: true, wireframe: true }
// on the ARMOURED elite's plate. Flat shading derives normals from screen-space
// derivatives, which are undefined on LINE primitives; the lighting goes NaN,
// and the bloom blur smears that NaN into a giant black region - the stepped
// edges are the bloom mip pyramid. It only manifested when an armoured elite
// was on screen, which is why it was intermittent and why a test suite that
// never rendered one shipped it.
//
// This scan makes the combination unshippable.

const here = dirname(fileURLToPath(import.meta.url));

function allSource() {
  let out = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".js")) out.push({ file: p, src: readFileSync(p, "utf-8") });
    }
  };
  walk(join(here, "..", "..", "src"));
  return out;
}

describe("no material combines flat shading with wireframe", () => {
  it("scans every material constructor in src", () => {
    let checked = 0;
    for (const { file, src } of allSource()) {
      // every {...} passed to a Material constructor
      for (const m of src.matchAll(/new THREE\.\w*Material\s*\(\s*\{([^)]*)\}\s*\)/gs)) {
        checked++;
        const body = m[1];
        const cursed = /flatShading\s*:\s*true/.test(body) && /wireframe\s*:\s*true/.test(body);
        expect(cursed, `${file}: flatShading+wireframe = NaN normals on lines, bloom smears it into the black square`).toBe(false);
      }
    }
    // self-check: a scan that found nothing proves nothing
    expect(checked).toBeGreaterThan(20);
  });
});
