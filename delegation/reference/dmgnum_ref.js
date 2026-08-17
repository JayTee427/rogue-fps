// REFERENCE — never shown to the worker.
const KIND = {
  hit:  { life: 0.7, scale: 1.0, vy: 1.6 },
  crit: { life: 0.9, scale: 1.6, vy: 2.2 },
  heal: { life: 0.8, scale: 1.0, vy: 1.4 },
  dot:  { life: 0.5, scale: 0.8, vy: 1.2 },
};
const MERGE_WINDOW = 0.12;

export function createNumbers(capacity) { return { capacity, items: [] }; }

export function pushNumber(n, { value, x, y, z, kind = "hit", targetId = null }) {
  if (targetId != null) {
    const m = n.items.find(e => e.targetId === targetId && e.kind === kind && e.age <= MERGE_WINDOW);
    if (m) { m.value += value; m.text = fmt(m.value, kind); m.age = 0; m.x = x; m.y = y; m.z = z; return m; }
  }
  const k = KIND[kind] ?? KIND.hit;
  const e = { value, text: fmt(value, kind), x, y, z, kind, targetId, age: 0, life: k.life, scale: k.scale, vy: k.vy, alpha: 1 };
  if (n.items.length >= n.capacity) n.items.shift();
  n.items.push(e);
  return e;
}

function fmt(v, kind) {
  const r = Math.max(1, Math.round(v));
  return kind === "heal" ? `+${r}` : `${r}`;
}

export function stepNumbers(n, dt) {
  for (const e of n.items) {
    e.age += dt; e.y += e.vy * dt;
    const f = e.age / e.life;
    e.alpha = f < 0.6 ? 1 : Math.max(0, 1 - (f - 0.6) / 0.4);
  }
  n.items = n.items.filter(e => e.age < e.life);
  return n.items.length;
}

export function projectToScreen(p, m, w, h) {
  // column-major 4x4
  const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
  const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
  const z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
  const ww = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
  if (ww <= 0) return { x: 0, y: 0, visible: false };
  const nx = x / ww, ny = y / ww, nz = z / ww;
  const visible = nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1 && nz >= -1 && nz <= 1;
  return { x: (nx + 1) / 2 * w, y: (1 - ny) / 2 * h, visible };
}
