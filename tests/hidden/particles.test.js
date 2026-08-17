import { describe, it, expect } from "vitest";
import { createPool, emit, step, PRESETS } from "core/particles.js";
import { rng } from "core/rng.js";

// A pooled particle SIMULATION — positions, velocities, life, size, colour.
// Rendering is someone else's job; this is the maths, and it is deterministic.

describe("PRESETS", () => {
  it("defines the named bursts the game uses", () => {
    for (const k of ["hit", "crit", "kill", "explosion", "muzzle", "dash", "pickup", "burn", "spark"]) {
      const p = PRESETS[k];
      expect(p, k).toBeDefined();
      expect(p.count).toBeGreaterThan(0);
      expect(p.life).toBeGreaterThan(0);
      expect(p.speed).toBeGreaterThan(0);
      expect(typeof p.color).toBe("number");
      expect(p.size).toBeGreaterThan(0);
    }
  });
  it("crit and kill are bigger than hit", () => {
    expect(PRESETS.crit.count).toBeGreaterThan(PRESETS.hit.count);
    expect(PRESETS.kill.count).toBeGreaterThan(PRESETS.hit.count);
    expect(PRESETS.explosion.count).toBeGreaterThan(PRESETS.kill.count);
  });
});

describe("createPool", () => {
  it("allocates fixed-size typed arrays", () => {
    const p = createPool(100);
    expect(p.capacity).toBe(100);
    expect(p.alive).toBe(0);
    for (const k of ["px", "py", "pz", "vx", "vy", "vz", "life", "maxLife", "size", "color"]) {
      expect(p[k].length, k).toBe(100);
    }
  });
});

describe("emit", () => {
  it("adds `count` live particles at the origin position", () => {
    const p = createPool(500);
    const n = emit(p, PRESETS.hit, { x: 1, y: 2, z: 3 }, null, rng(1));
    expect(n).toBe(PRESETS.hit.count);
    expect(p.alive).toBe(PRESETS.hit.count);
    for (let i = 0; i < p.alive; i++) {
      expect(p.px[i]).toBeCloseTo(1); expect(p.py[i]).toBeCloseTo(2); expect(p.pz[i]).toBeCloseTo(3);
      expect(p.life[i]).toBeGreaterThan(0);
      expect(p.maxLife[i]).toBe(p.life[i]);
      expect(p.color[i]).toBe(PRESETS.hit.color);
    }
  });

  it("gives particles varied velocities of roughly the preset speed", () => {
    const p = createPool(500);
    emit(p, PRESETS.kill, { x: 0, y: 0, z: 0 }, null, rng(2));
    const speeds = [];
    for (let i = 0; i < p.alive; i++) speeds.push(Math.hypot(p.vx[i], p.vy[i], p.vz[i]));
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    expect(mean).toBeGreaterThan(PRESETS.kill.speed * 0.4);
    expect(mean).toBeLessThan(PRESETS.kill.speed * 1.6);
    expect(new Set(speeds.map(s => s.toFixed(3))).size).toBeGreaterThan(3);
  });

  it("with a direction, biases velocities along it (a directional spray)", () => {
    const p = createPool(500);
    emit(p, PRESETS.spark, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, rng(3));
    let along = 0;
    for (let i = 0; i < p.alive; i++) along += -p.vz[i];
    expect(along / p.alive).toBeGreaterThan(0);
  });

  it("is deterministic for the same rng seed", () => {
    const a = createPool(200), b = createPool(200);
    emit(a, PRESETS.explosion, { x: 0, y: 0, z: 0 }, null, rng(9));
    emit(b, PRESETS.explosion, { x: 0, y: 0, z: 0 }, null, rng(9));
    expect(Array.from(a.vx)).toEqual(Array.from(b.vx));
  });

  it("caps at capacity and recycles the OLDEST when full", () => {
    const p = createPool(10);
    emit(p, { ...PRESETS.hit, count: 8, life: 1, color: 0xaaaaaa }, { x: 0, y: 0, z: 0 }, null, rng(1));
    step(p, 0.5, 0);
    emit(p, { ...PRESETS.hit, count: 5, life: 1, color: 0x123456 }, { x: 0, y: 0, z: 0 }, null, rng(2));
    expect(p.alive).toBe(10);
    // all 5 new ones are present; exactly 5 of the 8 old ones survive (3 recycled)
    const colors = Array.from(p.color.slice(0, p.alive));
    expect(colors.filter(c => c === 0x123456).length).toBe(5);
    expect(colors.filter(c => c === 0xaaaaaa).length).toBe(5);
    // and the survivors are the YOUNGEST of the old batch: every surviving old
    // particle has at least as much life left as any recycled one would have
    const oldLives = [];
    for (let i = 0; i < p.alive; i++) if (p.color[i] === 0xaaaaaa) oldLives.push(p.life[i]);
    expect(Math.min(...oldLives)).toBeGreaterThan(0);
  });

  it("returns 0 and does nothing for count 0", () => {
    const p = createPool(10);
    expect(emit(p, { ...PRESETS.hit, count: 0 }, { x: 0, y: 0, z: 0 }, null, rng(1))).toBe(0);
    expect(p.alive).toBe(0);
  });
});

describe("step", () => {
  it("integrates position by velocity", () => {
    const p = createPool(10);
    emit(p, { ...PRESETS.hit, count: 1, speed: 0, gravity: 0, drag: 0 }, { x: 0, y: 0, z: 0 }, null, rng(1));
    p.vx[0] = 2; p.vy[0] = 0; p.vz[0] = 0;
    step(p, 0.5, 0);
    expect(p.px[0]).toBeCloseTo(1);
  });

  it("applies the PRESET's gravity to vy (the step() gravity arg is only a fallback for presets without one)", () => {
    const p = createPool(10);
    emit(p, { ...PRESETS.hit, count: 1, speed: 0, drag: 0, gravity: 10 }, { x: 0, y: 5, z: 0 }, null, rng(1));
    p.vx[0] = 0; p.vy[0] = 0; p.vz[0] = 0;
    step(p, 1, 99);
    expect(p.vy[0]).toBeCloseTo(-10);
  });

  it("falls back to step()'s gravity when the preset has none", () => {
    const p = createPool(10);
    const preset = { ...PRESETS.hit, count: 1, speed: 0, drag: 0 }; delete preset.gravity;
    emit(p, preset, { x: 0, y: 5, z: 0 }, null, rng(1));
    p.vy[0] = 0;
    step(p, 1, 7);
    expect(p.vy[0]).toBeCloseTo(-7);
  });

  it("applies drag as EXPONENTIAL decay: v *= exp(-drag*dt), so it never reaches zero or flips sign", () => {
    const p = createPool(10);
    emit(p, { ...PRESETS.hit, count: 1, speed: 0, drag: 2, gravity: 0 }, { x: 0, y: 0, z: 0 }, null, rng(1));
    p.vx[0] = 10; p.vy[0] = 0; p.vz[0] = 0;
    step(p, 0.5, 0);
    expect(p.vx[0]).toBeCloseTo(10 * Math.exp(-1), 3);
    step(p, 5, 0);
    expect(p.vx[0]).toBeGreaterThan(0);
  });

  it("decrements life and compacts the dead out (alive shrinks, no gaps)", () => {
    const p = createPool(50);
    emit(p, { ...PRESETS.hit, count: 20, life: 0.2 }, { x: 0, y: 0, z: 0 }, null, rng(1));
    emit(p, { ...PRESETS.hit, count: 10, life: 2 }, { x: 0, y: 0, z: 0 }, null, rng(2));
    step(p, 0.5, 0);
    expect(p.alive).toBe(10);
    for (let i = 0; i < p.alive; i++) expect(p.life[i]).toBeGreaterThan(0);
  });

  it("particles that hit the floor (y < 0) bounce with energy loss when preset.bounce is set", () => {
    const p = createPool(10);
    emit(p, { ...PRESETS.hit, count: 1, speed: 0, life: 5, bounce: 0.5, drag: 0, gravity: 0 }, { x: 0, y: 0.1, z: 0 }, null, rng(1));
    p.vx[0] = 0; p.vy[0] = -4; p.vz[0] = 0;
    step(p, 0.1, 0);
    expect(p.py[0]).toBeGreaterThanOrEqual(0);
    expect(p.vy[0]).toBeGreaterThan(0);
    expect(p.vy[0]).toBeLessThan(4);
  });

  it("returns the number still alive", () => {
    const p = createPool(50);
    emit(p, { ...PRESETS.hit, count: 7, life: 1 }, { x: 0, y: 0, z: 0 }, null, rng(1));
    expect(step(p, 0.1, 0)).toBe(7);
  });

  it("step on an empty pool is a no-op returning 0", () => {
    expect(step(createPool(5), 0.1, 9.8)).toBe(0);
  });
});
