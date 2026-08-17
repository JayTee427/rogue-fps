// src/core/dmgnum.js

const KIND_PROPS = {
  hit: { life: 0.7, scale: 1.0, vy: 1.6 },
  crit: { life: 0.9, scale: 1.6, vy: 2.2 },
  heal: { life: 0.8, scale: 1.0, vy: 1.4 },
  dot: { life: 0.5, scale: 0.8, vy: 1.2 }
};

function formatText(value, kind) {
  const rounded = Math.max(1, Math.round(value));
  return kind === "heal" ? "+" + rounded : String(rounded);
}

export function createNumbers(capacity) {
  return { capacity, items: [] };
}

export function pushNumber(n, { value, x, y, z, kind = "hit", targetId = null }) {
  const props = KIND_PROPS[kind] || KIND_PROPS.hit;
  const text = formatText(value, kind);

  if (targetId != null) {
    for (let i = 0; i < n.items.length; i++) {
      const e = n.items[i];
      if (e.targetId === targetId && e.kind === kind && e.age <= 0.12) {
        e.value += value;
        e.text = formatText(e.value, kind);
        e.age = 0;
        e.x = x;
        e.y = y;
        e.z = z;
        return;
      }
    }
  }

  const entry = {
    value,
    text,
    x,
    y,
    z,
    kind,
    targetId,
    age: 0,
    life: props.life,
    scale: props.scale,
    vy: props.vy,
    alpha: 1
  };

  if (n.items.length >= n.capacity) {
    n.items.shift();
  }
  n.items.push(entry);
}

export function stepNumbers(n, dt) {
  const items = n.items;
  let writeIdx = 0;

  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    e.age += dt;
    e.y += e.vy * dt;

    const ratio = e.age / e.life;
    if (ratio < 0.6) {
      e.alpha = 1;
    } else {
      e.alpha = 1 - (ratio - 0.6) / 0.4;
      if (e.alpha < 0) e.alpha = 0;
    }

    if (e.age < e.life) {
      items[writeIdx++] = e;
    }
  }

  n.items.length = writeIdx;
  return n.items.length;
}

export function projectToScreen(p, m, w, h) {
  const x = p.x, y = p.y, z = p.z;

  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];

  if (cw <= 0) {
    return { x: 0, y: 0, visible: false };
  }

  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;

  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1 || ndcZ < -1 || ndcZ > 1) {
    return { x: 0, y: 0, visible: false };
  }

  return {
    x: (ndcX + 1) / 2 * w,
    y: (1 - ndcY) / 2 * h,
    visible: true
  };
}