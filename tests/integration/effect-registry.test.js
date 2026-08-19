import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EFFECT_KEYS, keyKind, auditEffects, auditAll } from "core/registry.js";
import { ITEMS } from "core/items.js";
import { SYNERGIES } from "core/synergy.js";
import { WEAPON_MODS } from "core/weapons.js";
import { BOONS, rollPact, acceptPact } from "core/pact.js";
import { BASE_STATS, computeStats } from "core/stats.js";
import { HANDLED as PASSIVE } from "core/effects.js";
import { HANDLED as TRIGGERED } from "core/triggers.js";
import { rng } from "core/rng.js";

// An unregistered effect key does not error - it does nothing, silently. That
// silence shipped 47 inert items, 8 dead weapon mods, a blindfire that was
// never inaccurate, and a pact system that charged its curse and never paid
// its boon (acceptPact stored `boon`, the game read `boons`). Every one of
// those passed 779 tests, because every test asked whether the data was
// well-formed and none asked whether anyone was listening.
//
// The registry is the single vocabulary. These tests close the loop in both
// directions: everything declared is registered, and everything registered is
// consumed.

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, "..", "..", ...p), "utf-8");

describe("every producer speaks the registered vocabulary", () => {
  it("audits clean across items, synergies, weapon mods and pact boons", async () => {
    expect(await auditAll()).toEqual([]);
  });

  it("catches an unknown key (the audit itself must be able to fail)", () => {
    const findings = auditEffects({ fake: [{ id: "impostor", effects: { flame_bladez: { add: 1 } } }] });
    expect(findings).toEqual([{ source: "fake", id: "impostor", key: "flame_bladez" }]);
  });

  it("has no case-insensitive near-duplicates among declared keys", () => {
    // The registry throws on these at import; this re-checks the producers
    // directly so the failure names the item rather than the module load.
    const seen = new Map();
    const declare = (owner, key) => {
      const lo = key.toLowerCase();
      const prior = seen.get(lo);
      expect(prior === undefined || prior.key === key,
        `"${prior?.key}" (${prior?.owner}) vs "${key}" (${owner}) differ only by case`).toBe(true);
      if (!prior) seen.set(lo, { key, owner });
    };
    for (const it_ of ITEMS) for (const k of Object.keys(it_.effects ?? {})) declare(it_.id, k);
    for (const [id, s] of Object.entries(SYNERGIES)) for (const k of Object.keys(s.effects ?? {})) declare(id, k);
    for (const [id, m] of Object.entries(WEAPON_MODS)) for (const k of Object.keys(m.effects ?? {})) declare(id, k);
    for (const [id, b] of Object.entries(BOONS)) for (const k of Object.keys(b.effects ?? {})) declare(id, k);
  });
});

describe("every registered key has a consumer", () => {
  it("every passive/trigger HANDLED key is actually handled in its module", () => {
    const eff = read("src", "core", "effects.js");
    const trg = read("src", "core", "triggers.js");
    for (const k of PASSIVE) {
      expect(eff.includes(`"${k}"`) && eff.split(`"${k}"`).length > 2,
        `effects.js lists "${k}" as HANDLED but never handles it`).toBe(true);
    }
    for (const k of TRIGGERED) {
      expect(trg.includes(`"${k}"`) && trg.split(`"${k}"`).length > 2,
        `triggers.js lists "${k}" as HANDLED but never handles it`).toBe(true);
    }
  });

  it("every stat-kind key is read somewhere outside the producers", () => {
    // A dotted read (`.key`) outside the files that *grant* effects. Bare-word
    // scanning is what let six anatomy words survive in the stat table - a
    // comment containing "head" kept `head: 0` alive for weeks.
    const producers = new Set(["items.js", "synergy.js", "weapons.js", "pact.js", "meta.js", "stats.js", "registry.js"]);
    let src = "";
    const walk = (dir) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith(".js") && !producers.has(f.name)) src += readFileSync(p, "utf-8");
      }
    };
    walk(join(here, "..", "..", "src"));
    const orphans = [...EFFECT_KEYS].filter(([k, kind]) => kind === "stat")
      .filter(([k]) => !new RegExp(`\\.${k}\\b`).test(src))
      .map(([k]) => k);
    expect(orphans, `stat keys nothing reads: ${orphans.join(", ")}`).toEqual([]);
  });
});

describe("pacts pay out", () => {
  it("every boon changes at least one registered stat", () => {
    for (const [id, boon] of Object.entries(BOONS)) {
      const before = computeStats(BASE_STATS, []);
      const after = computeStats(BASE_STATS, [{ id: `pact_${id}`, effects: boon.effects }]);
      const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
      expect(moved.length, `boon "${id}" changes nothing - its keys are dead`).toBeGreaterThan(0);
      for (const k of Object.keys(boon.effects)) {
        expect(keyKind(k), `boon "${id}" key "${k}" is unregistered`).toBeTruthy();
      }
    }
  });

  it("accepting a pact lands the boon where the game reads it", () => {
    const r = rng(1234).fork("pact");
    const run = { held: [], boons: [], floor: 1, roomIndex: 2 };
    const pact = rollPact(r, run);
    expect(pact).toBeTruthy();
    const after = acceptPact(run, pact);
    // The original shape stored `boon` (singular) and `effects`; recomputeStats
    // reads `boons`. Every pact in the game was a scam until this test existed.
    expect(after.boons).toContain(pact.boon);
    expect(after.held).toContain(pact.curse);
    expect(after.effects).toBeUndefined();
  });
});
