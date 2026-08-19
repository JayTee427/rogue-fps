import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BIOMES, biomePalette } from "../../src/core/arenas.js";

// A biome shipped a palette with five of the seven keys buildArena reads. THREE
// does not throw on `color: undefined` - it warns to the console and silently
// renders the material white. So four materials a room came out wrong and every
// test still passed, because every test asked whether the palette was
// well-formed rather than whether it was *complete for its consumer*.
//
// The same blind spot then hid the real damage: the biome albedos were never
// art-directed against the lighting, so the world rendered at a fifth of the
// brightness the lighting was tuned for. Measured wall luminance at 20m was
// 17-25 of 255 against a documented black-void floor of 40. The game was
// playable in the sense that it ran, and unplayable in the sense that you could
// not see it.
//
// Both assertions below read the requirement out of the source that imposes it,
// so neither can drift away from the code it guards.

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, "..", "..", ...p), "utf-8");

const RENDERER = read("src", "game", "renderer.js");
// The run flow (biomeFog, the buildArena call) lives in flow.js since the
// main.js split; main.js is a 22-line entry point now.
const MAIN = read("src", "game", "flow.js");

/** Every `pal.<key>` buildArena dereferences. */
function keysBuildArenaReads() {
  return [...new Set([...RENDERER.matchAll(/\bpal\.(\w+)/g)].map((m) => m[1]))].sort();
}

describe("arena palettes are complete for their consumer", () => {
  it("finds the keys buildArena reads (self-check: a silent scan proves nothing)", () => {
    const keys = keysBuildArenaReads();
    expect(keys.length).toBeGreaterThan(3);
    expect(keys).toContain("floor");
    expect(keys).toContain("wall");
  });

  it("every biome palette defines every key buildArena reads", () => {
    const need = keysBuildArenaReads();
    const gaps = [];
    for (const id of Object.keys(BIOMES)) {
      const pal = biomePalette(id);
      const missing = need.filter((k) => !Number.isFinite(pal?.[k]));
      if (missing.length) gaps.push(`${id}: missing ${missing.join(", ")}`);
    }
    expect(gaps).toEqual([]);
  });

  it("flow.js forwards the whole palette rather than cherry-picking keys", () => {
    // The original bug in one line. Listing keys at the call site means the list
    // has to be updated whenever buildArena reads a new one, and nothing says so.
    const call = MAIN.match(/palette:\s*([^\n]*)/);
    expect(call, "no palette: passed to buildArena").toBeTruthy();
    expect(call[1], "palette is being rebuilt key-by-key at the call site").not.toMatch(/\{.*floor:/);
  });
});

// ---------------------------------------------------------------------------
// Brightness. Lighting is identical for every biome (arenas.js lightIntensity is
// read by nothing), so albedo and fog are the only variables - which makes this
// exactly computable without a renderer. Pipeline matches the shader: sRGB
// albedo -> linear, mix with fog in linear, -> sRGB. FogExp2 is
// f = 1 - exp(-(d * density)^2).

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => s2l(v / 255));
const luma = (l) => 255 * l2s(0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]);

/** The live biomeFog mapping, read out of main.js so it cannot drift from it. */
function biomeFog(v) {
  const m = MAIN.match(/return\s+([\d.]+)\s*\+\s*t\s*\*\s*([\d.]+);/);
  const t = Math.max(0, Math.min(1, (Number.isFinite(v) ? v : 0.1) / 0.4));
  return Number(m[1]) + t * Number(m[2]);
}

const DEFAULT_FOG = Number(RENDERER.match(/FogExp2\((0x[0-9a-fA-F]+)/)[1]);

function seenAt(hex, density, metres, fogHex) {
  const f = 1 - Math.exp(-((metres * density) ** 2));
  const F = lin(fogHex);
  return luma(lin(hex).map((c, i) => c * (1 - f) + F[i] * f));
}

// renderer.js documents the band the lighting was tuned to: "a frame from spawn
// should average ~65/255 ... below ~40 the arena reads as a black void".
const BLACK_VOID = 40;

describe("no biome renders as a black void", () => {
  it("keeps that floor tied to the comment that states it", () => {
    expect(RENDERER).toMatch(/below ~40 the arena reads as a black void/i);
  });

  for (const id of Object.keys(BIOMES)) {
    it(`${id}: a wall 20m away stays above the black-void floor`, () => {
      const pal = biomePalette(id);
      const lit = seenAt(pal.wall, biomeFog(pal.fogDensity), 20, pal.fog ?? DEFAULT_FOG);
      expect(lit, `${id} wall@20m = ${lit.toFixed(1)}/255`).toBeGreaterThan(BLACK_VOID);
    });
  }

  it("fog leaves the far side of the largest arena visible", () => {
    // biomeLayout caps halfW at 30, so a sightline can run the full 60m.
    for (const id of Object.keys(BIOMES)) {
      const pal = biomePalette(id);
      const f = 1 - Math.exp(-((60 * biomeFog(pal.fogDensity)) ** 2));
      expect(f, `${id} fogs out ${(f * 100).toFixed(0)}% of a 60m sightline`).toBeLessThan(0.95);
    }
  });
});
