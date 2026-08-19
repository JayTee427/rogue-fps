// src/core/registry.js
//
// The single vocabulary of effect keys. Anything an item, weapon mod, synergy
// or pact declares must be a key registered here, and every registered key has
// exactly one kind - which says who consumes it:
//
//   stat        merged by computeStats, read off the run's stats object
//   passive     consumed by effects.js passiveMods (its HANDLED list)
//   trigger     consumed by triggers.js event hooks (its HANDLED list)
//   weapon      lives on a weapon's stats, spread over player stats in fire()
//   acquisition consumed once, at the moment the item is taken (run.js)
//
// Why this exists: an unregistered key does not error, it just does nothing.
// That silence shipped 47 inert items, 8 dead weapon mods, a pact system that
// only ever charged its price, and two casings of "lifesteal" running through
// two different code paths. The registry turns all of that into a loud test
// failure at authoring time.
//
// This module throws AT IMPORT if the vocabulary is inconsistent - a key
// claimed by two consumers, or two keys differing only by case, is a build
// error, not a runtime surprise.

import { BASE_STATS } from "core/stats.js";
import { HANDLED as PASSIVE } from "core/effects.js";
import { HANDLED as TRIGGERED } from "core/triggers.js";
import { ARCHETYPES, WEAPON_MODS } from "core/weapons.js";

// Keys consumed at item-acquisition time rather than merged into stats.
const ACQUISITION = ["loseRandomItem"];

/** key -> kind. Built once; collisions throw. */
export const EFFECT_KEYS = new Map();

function register(key, kind) {
  const prior = EFFECT_KEYS.get(key);
  if (prior && prior !== kind) {
    throw new Error(`effect key "${key}" claimed by both ${prior} and ${kind}`);
  }
  EFFECT_KEYS.set(key, prior ?? kind);
}

for (const k of Object.keys(BASE_STATS)) register(k, "stat");
for (const k of PASSIVE) register(k, "passive");
for (const k of TRIGGERED) register(k, "trigger");
for (const k of ACQUISITION) register(k, "acquisition");
// Weapon vocabulary is derived from the archetype tables themselves, so a new
// weapon field is registered by existing rather than by being remembered here.
for (const a of Object.values(ARCHETYPES)) {
  for (const k of Object.keys(a)) {
    if (k === "name") continue;
    if (!EFFECT_KEYS.has(k)) register(k, "weapon");
  }
}

// Two keys that differ only in case are one typo'd key wearing two coats -
// lifesteal/lifeSteal each passed every shape check while splitting the
// mechanic across two code paths.
{
  const byLower = new Map();
  for (const k of EFFECT_KEYS.keys()) {
    const lo = k.toLowerCase();
    if (byLower.has(lo)) {
      throw new Error(`effect keys "${byLower.get(lo)}" and "${k}" differ only by case`);
    }
    byLower.set(lo, k);
  }
}

export function keyKind(key) {
  return EFFECT_KEYS.get(key) ?? null;
}

/**
 * Every effect key declared by a producer that the registry does not know.
 * Producers are anything shaped like { id?, effects: { key: ... } }.
 * Returns [{ source, id, key }]; empty means the vocabulary is closed.
 */
export function auditEffects(producers) {
  const out = [];
  for (const [source, list] of Object.entries(producers)) {
    for (const entry of list) {
      for (const key of Object.keys(entry.effects ?? {})) {
        if (!EFFECT_KEYS.has(key)) out.push({ source, id: entry.id ?? entry.name ?? "?", key });
      }
    }
  }
  return out;
}

/** The registry audited against every producer the game ships. */
export async function auditAll() {
  const { ITEMS } = await import("core/items.js");
  const { SYNERGIES } = await import("core/synergy.js");
  const { BOONS } = await import("core/pact.js");
  return auditEffects({
    items: ITEMS,
    synergies: Object.values(SYNERGIES),
    weaponMods: Object.entries(WEAPON_MODS).map(([id, m]) => ({ id, ...m })),
    pactBoons: Object.values(BOONS),
  });
}
