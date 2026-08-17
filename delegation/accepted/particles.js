export const PRESETS = {
  hit: { count: 6, life: 0.35, speed: 5, size: 0.1, color: 0xffd080, gravity: 0, drag: 0, spread: 1 },
  crit: { count: 14, life: 0.4, speed: 6, size: 0.12, color: 0xffff00, gravity: 0, drag: 0, spread: 1 },
  kill: { count: 24, life: 0.5, speed: 7, size: 0.15, color: 0xff4040, gravity: 0, drag: 0, spread: 1 },
  explosion: { count: 60, life: 0.6, speed: 10, size: 0.2, color: 0xff8020, gravity: 9.8, drag: 0.5, spread: 1 },
  muzzle: { count: 5, life: 0.2, speed: 8, size: 0.08, color: 0xffd080, gravity: 0, drag: 0, spread: 1 },
  dash: { count: 12, life: 0.3, speed: 9, size: 0.1, color: 0x80ffff, gravity: 0, drag: 0, spread: 1 },
  pickup: { count: 20, life: 0.7, speed: 4, size: 0.1, color: 0x00ff00, gravity: 0, drag: 0, spread: 1 },
  burn: { count: 3, life: 0.5, speed: 3, size: 0.1, color: 0xff4000, gravity: 0, drag: 0, spread: 1 },
  spark: { count: 10, life: 0.25, speed: 6, size: 0.05, color: 0xffffff, gravity: 0, drag: 0, spread: 1 }
};

export function createPool(capacity) {
  return {
    capacity,
    alive: 0,
    px: new Float32Array(capacity),
    py: new Float32Array(capacity),
    pz: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    life: new Float32Array(capacity),
    maxLife: new Float32Array(capacity),
    size: new Float32Array(capacity),
    color: new Uint32Array(capacity),
    preset: new Array(capacity)
  };
}

function randomUnitVector(rng) {
  const u = rng.next();
  const v = rng.next();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const sinPhi = Math.sin(phi);
  return [
    sinPhi * Math.cos(theta),
    sinPhi * Math.sin(theta),
    Math.cos(phi)
  ];
}

function normalize(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function getComponent(obj, index) {
  if (Array.isArray(obj)) {
    return obj[index];
  }
  const keys = ['x', 'y', 'z'];
  return obj[keys[index]];
}

export function emit(pool, preset, pos, dir, rng) {
  const count = Math.floor(preset.count);
  if (count === 0) return 0;

  let emitted = 0;
  for (let i = 0; i < count; i++) {
    let index;
    if (pool.alive < pool.capacity) {
      index = pool.alive;
      pool.alive++;
    } else {
      // Recycle oldest particle (lowest remaining life)
      let oldest = 0;
      for (let j = 1; j < pool.alive; j++) {
        if (pool.life[j] < pool.life[oldest]) {
          oldest = j;
        }
      }
      index = oldest;
    }

    pool.px[index] = getComponent(pos, 0);
    pool.py[index] = getComponent(pos, 1);
    pool.pz[index] = getComponent(pos, 2);

    let vel = randomUnitVector(rng);
    if (dir) {
      // Bias toward dir
      vel = [
        vel[0] + getComponent(dir, 0),
        vel[1] + getComponent(dir, 1),
        vel[2] + getComponent(dir, 2)
      ];
      vel = normalize(vel);
    }

    const speed = preset.speed * (0.5 + rng.next());
    pool.vx[index] = vel[0] * speed;
    pool.vy[index] = vel[1] * speed;
    pool.vz[index] = vel[2] * speed;

    const life = preset.life * (0.7 + 0.6 * rng.next());
    pool.life[index] = life;
    pool.maxLife[index] = life;

    pool.size[index] = preset.size * (0.7 + 0.6 * rng.next());
    pool.color[index] = preset.color;
    pool.preset[index] = preset;

    emitted++;
  }

  return emitted;
}

export function step(pool, dt, gravity) {
  if (pool.alive === 0) return 0;

  let writeIndex = 0;

  for (let i = 0; i < pool.alive; i++) {
    const preset = pool.preset[i];
    const g = preset.gravity !== undefined ? preset.gravity : gravity;

    // Apply gravity
    pool.vy[i] -= g * dt;

    // Apply drag
    if (preset.drag > 0) {
      const dragFactor = Math.exp(-preset.drag * dt);
      pool.vx[i] *= dragFactor;
      pool.vy[i] *= dragFactor;
      pool.vz[i] *= dragFactor;
    }

    // Update position
    pool.px[i] += pool.vx[i] * dt;
    pool.py[i] += pool.vy[i] * dt;
    pool.pz[i] += pool.vz[i] * dt;

    // Bounce
    if (preset.bounce && pool.py[i] < 0) {
      pool.py[i] = 0;
      pool.vy[i] = -pool.vy[i] * preset.bounce;
      pool.vx[i] *= 0.8;
      pool.vz[i] *= 0.8;
    }

    // Update life
    pool.life[i] -= dt;

    if (pool.life[i] > 0) {
      // Keep this particle
      if (writeIndex !== i) {
        pool.px[writeIndex] = pool.px[i];
        pool.py[writeIndex] = pool.py[i];
        pool.pz[writeIndex] = pool.pz[i];
        pool.vx[writeIndex] = pool.vx[i];
        pool.vy[writeIndex] = pool.vy[i];
        pool.vz[writeIndex] = pool.vz[i];
        pool.life[writeIndex] = pool.life[i];
        pool.maxLife[writeIndex] = pool.maxLife[i];
        pool.size[writeIndex] = pool.size[i];
        pool.color[writeIndex] = pool.color[i];
        pool.preset[writeIndex] = pool.preset[i];
      }
      writeIndex++;
    }
  }

  pool.alive = writeIndex;
  return pool.alive;
}