// REFERENCE — never shown to the worker.
export const BASE_STATS = {
  maxHp: 100, damage: 1, fireRate: 1, moveSpeed: 8, critChance: 0.05, critMult: 2,
  spread: 1, reloadTime: 1, magSize: 1, jumps: 1, dashCooldown: 3, gravity: 1,
  projSpeed: 1, projSize: 1, pierce: 0, bounces: 0,
};

const CAPS = { critChance: 1 };
const DIMINISHING = new Set(["deflect"]);

export function computeStats(base, held) {
  const out = { ...base };
  const adds = {}, muls = {}, dims = {};
  const seen = new Set();
  for (const it of held) {
    if (!it.stacks && seen.has(it.id)) continue;
    seen.add(it.id);
    for (const [k, eff] of Object.entries(it.effects)) {
      if (eff === true) { out[k] = true; continue; }
      if (DIMINISHING.has(k) && eff.add != null) { dims[k] = (dims[k] ?? 0) + 1; dims[k + "_p"] = eff.add; continue; }
      if (eff.add != null) adds[k] = (adds[k] ?? 0) + eff.add;
      if (eff.mul != null) muls[k] = (muls[k] ?? 1) * eff.mul;
    }
  }
  const keys = new Set([...Object.keys(adds), ...Object.keys(muls)]);
  for (const k of keys) out[k] = ((out[k] ?? 0) + (adds[k] ?? 0)) * (muls[k] ?? 1);
  for (const k of Object.keys(dims)) if (!k.endsWith("_p")) out[k] = 1 - (1 - dims[k + "_p"]) ** dims[k];
  for (const [k, cap] of Object.entries(CAPS)) if (out[k] != null) out[k] = Math.min(out[k], cap);
  if (out.maxHp != null) out.maxHp = Math.max(1, out.maxHp);
  return out;
}
