import { describe, it, expect } from "vitest";
import { aimAssist } from "core/assist.js";

// Vectors are plain {x,y,z}. aimDir is a unit vector. targets are
// [{ x,y,z }] world positions relative to the shooter (shooter at origin).
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

describe("aimAssist", () => {
  it("strength 0 returns the input direction unchanged", () => {
    const d = unit(0, 0, -1);
    const out = aimAssist(d, [{ x: 0.5, y: 0, z: -10 }], 0);
    expect(out).toEqual(d);
  });

  it("returns a unit vector", () => {
    const out = aimAssist(unit(0, 0, -1), [{ x: 1, y: 0.5, z: -8 }], 0.5);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 6);
  });

  it("with no targets, returns the input", () => {
    const d = unit(0.1, 0, -1);
    expect(aimAssist(d, [], 1)).toEqual(d);
  });

  it("bends toward a target inside the cone", () => {
    const d = unit(0, 0, -1);
    const target = { x: 1, y: 0, z: -10 };           // ~5.7 degrees off axis
    const out = aimAssist(d, [target], 0.5);
    const tDir = unit(1, 0, -10);
    expect(angleBetween(out, tDir)).toBeLessThan(angleBetween(d, tDir));
  });

  it("strength 1 snaps fully onto the target direction", () => {
    const d = unit(0, 0, -1);
    const target = { x: 0.6, y: 0.2, z: -10 };
    const out = aimAssist(d, [target], 1);
    const tDir = unit(0.6, 0.2, -10);
    expect(angleBetween(out, tDir)).toBeLessThan(1e-6);
  });

  it("does NOT bend toward a target outside the assist cone (default ~8 degrees)", () => {
    const d = unit(0, 0, -1);
    const target = { x: 5, y: 0, z: -10 };           // ~26.6 degrees off — outside
    expect(aimAssist(d, [target], 1)).toEqual(d);
  });

  it("respects a custom cone in degrees", () => {
    const d = unit(0, 0, -1);
    const target = { x: 5, y: 0, z: -10 };           // 26.6 degrees
    expect(aimAssist(d, [target], 1, { coneDeg: 30 })).not.toEqual(d);
    expect(aimAssist(d, [target], 1, { coneDeg: 20 })).toEqual(d);
  });

  it("picks the target nearest to the aim axis (smallest angle), not the nearest in distance", () => {
    const d = unit(0, 0, -1);
    const nearButOff = { x: 1.2, y: 0, z: -9 };      // ~7.6 deg, distance ~9.1
    const farButOn   = { x: 0.2, y: 0, z: -30 };     // ~0.4 deg, distance ~30
    const out = aimAssist(d, [nearButOff, farButOn], 1);
    expect(angleBetween(out, unit(0.2, 0, -30))).toBeLessThan(1e-6);
  });

  it("ignores targets behind the shooter", () => {
    const d = unit(0, 0, -1);
    expect(aimAssist(d, [{ x: 0, y: 0, z: 10 }], 1)).toEqual(d);
  });

  it("strength between 0 and 1 interpolates: 0.5 bends about halfway", () => {
    const d = unit(0, 0, -1);
    const target = { x: 1, y: 0, z: -10 };
    const tDir = unit(1, 0, -10);
    const full = angleBetween(d, tDir);
    const half = angleBetween(aimAssist(d, [target], 0.5), tDir);
    expect(half).toBeGreaterThan(full * 0.35);
    expect(half).toBeLessThan(full * 0.65);
  });

  it("does not mutate its inputs", () => {
    const d = unit(0, 0, -1);
    const targets = [{ x: 1, y: 0, z: -10 }];
    const dc = JSON.stringify(d), tc = JSON.stringify(targets);
    aimAssist(d, targets, 0.7);
    expect(JSON.stringify(d)).toBe(dc);
    expect(JSON.stringify(targets)).toBe(tc);
  });
});
