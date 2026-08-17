// REFERENCE — never shown to the worker.
const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export function aimAssist(aimDir, targets, strength, opts = {}) {
  if (!targets?.length || strength <= 0) return { ...aimDir };
  const cone = ((opts.coneDeg ?? 8) * Math.PI) / 180;
  const d = norm(aimDir);
  let best = null, bestAng = Infinity;
  for (const t of targets) {
    const td = norm(t);
    const c = dot(d, td);
    if (c <= 0) continue;                       // behind
    const ang = Math.acos(Math.min(1, c));
    if (ang <= cone && ang < bestAng) { best = td; bestAng = ang; }
  }
  if (!best) return { ...aimDir };
  const s = Math.min(1, strength);
  // slerp-ish: lerp then renormalise is fine for small angles
  return norm({ x: d.x + (best.x - d.x) * s, y: d.y + (best.y - d.y) * s, z: d.z + (best.z - d.z) * s });
}
