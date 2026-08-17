// REFERENCE — never shown to the worker.
export const PRESETS = {
  hit:       { count: 6,  life: 0.35, speed: 5,  size: 0.06, color: 0xffd080, gravity: 8,  drag: 2, spread: 1 },
  crit:      { count: 14, life: 0.5,  speed: 8,  size: 0.09, color: 0xffee88, gravity: 8,  drag: 2, spread: 1 },
  kill:      { count: 24, life: 0.7,  speed: 9,  size: 0.1,  color: 0xff6a3a, gravity: 12, drag: 1.5, spread: 1, bounce: 0.4 },
  explosion: { count: 60, life: 0.9,  speed: 14, size: 0.16, color: 0xffa040, gravity: 10, drag: 1.2, spread: 1, bounce: 0.3 },
  muzzle:    { count: 5,  life: 0.08, speed: 12, size: 0.05, color: 0xfff0c0, gravity: 0,  drag: 6, spread: 0.3 },
  dash:      { count: 12, life: 0.3,  speed: 3,  size: 0.08, color: 0x3ad1ff, gravity: 0,  drag: 3, spread: 1 },
  pickup:    { count: 20, life: 0.8,  speed: 4,  size: 0.07, color: 0xffd166, gravity: -3, drag: 1, spread: 1 },
  burn:      { count: 3,  life: 0.5,  speed: 1.5,size: 0.08, color: 0xff7a1a, gravity: -4, drag: 1, spread: 1 },
  spark:     { count: 10, life: 0.3,  speed: 10, size: 0.04, color: 0xffffff, gravity: 15, drag: 1, spread: 0.4, bounce: 0.5 },
};

export function createPool(capacity) {
  const F = () => new Float32Array(capacity);
  return { capacity, alive: 0, px: F(), py: F(), pz: F(), vx: F(), vy: F(), vz: F(), life: F(), maxLife: F(), size: F(), color: new Uint32Array(capacity), preset: new Array(capacity) };
}

function recycleOldest(p, n) {
  // sort-free: repeatedly evict the lowest life
  for (let k = 0; k < n; k++) {
    let oldest = 0;
    for (let i = 1; i < p.alive; i++) if (p.life[i] < p.life[oldest]) oldest = i;
    swapRemove(p, oldest);
  }
}
function swapRemove(p, i) {
  const j = p.alive - 1;
  for (const k of ["px","py","pz","vx","vy","vz","life","maxLife","size","color"]) p[k][i] = p[k][j];
  p.preset[i] = p.preset[j];
  p.alive--;
}

export function emit(p, preset, pos, dir, r) {
  const count = Math.max(0, Math.floor(preset.count));
  if (!count) return 0;
  const need = p.alive + count - p.capacity;
  if (need > 0) recycleOldest(p, Math.min(need, p.alive));
  const n = Math.min(count, p.capacity - p.alive);
  const spread = preset.spread ?? 1;
  for (let k = 0; k < n; k++) {
    const i = p.alive++;
    p.px[i] = pos.x; p.py[i] = pos.y; p.pz[i] = pos.z;
    // random direction on the sphere, optionally biased toward dir
    const th = r.next() * Math.PI * 2, ph = Math.acos(2 * r.next() - 1);
    let dx = Math.sin(ph) * Math.cos(th), dy = Math.sin(ph) * Math.sin(th), dz = Math.cos(ph);
    if (dir) { const b = 1 - spread; dx = dx * spread + dir.x * (b + 0.6); dy = dy * spread + dir.y * (b + 0.6); dz = dz * spread + dir.z * (b + 0.6); const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; }
    const sp = preset.speed * (0.5 + r.next());
    p.vx[i] = dx * sp; p.vy[i] = dy * sp; p.vz[i] = dz * sp;
    p.life[i] = preset.life * (0.7 + r.next() * 0.6); p.maxLife[i] = p.life[i];
    p.size[i] = preset.size * (0.7 + r.next() * 0.6);
    p.color[i] = preset.color;
    p.preset[i] = preset;
  }
  return n;
}

export function step(p, dt, gravity) {
  for (let i = p.alive - 1; i >= 0; i--) {
    const pr = p.preset[i] ?? {};
    const g = pr.gravity ?? gravity, drag = pr.drag ?? 0;
    p.vy[i] -= g * dt;
    if (drag > 0) { const f = Math.exp(-drag * dt); p.vx[i] *= f; p.vy[i] *= f; p.vz[i] *= f; }
    p.px[i] += p.vx[i] * dt; p.py[i] += p.vy[i] * dt; p.pz[i] += p.vz[i] * dt;
    if (pr.bounce && p.py[i] < 0) { p.py[i] = 0; p.vy[i] = -p.vy[i] * pr.bounce; p.vx[i] *= 0.8; p.vz[i] *= 0.8; }
    p.life[i] -= dt;
    if (p.life[i] <= 0) swapRemove(p, i);
  }
  return p.alive;
}
