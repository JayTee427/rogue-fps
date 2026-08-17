import { describe, it, expect } from "vitest";
import { createNumbers, pushNumber, stepNumbers, projectToScreen } from "core/dmgnum.js";

// Floating damage numbers: a pool of {value, world pos, age, kind}, plus a pure
// world→screen projection so the HUD can place them without touching three.

describe("createNumbers / pushNumber", () => {
  it("starts empty with a fixed capacity", () => {
    const n = createNumbers(32);
    expect(n.capacity).toBe(32);
    expect(n.items).toEqual([]);
  });

  it("pushNumber adds an entry with the fields the HUD needs", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 42, x: 1, y: 2, z: 3, kind: "hit" });
    expect(n.items).toHaveLength(1);
    const e = n.items[0];
    expect(e.value).toBe(42);
    expect(e.text).toBe("42");
    expect(e.x).toBe(1); expect(e.y).toBe(2); expect(e.z).toBe(3);
    expect(e.kind).toBe("hit");
    expect(e.age).toBe(0);
    expect(e.life).toBeGreaterThan(0);
    expect(e.vy).toBeGreaterThan(0);                 // floats upward
  });

  it("rounds values to integers for display and never shows 0 for a positive fractional hit", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 0.4, x: 0, y: 0, z: 0, kind: "hit" });
    pushNumber(n, { value: 12.6, x: 0, y: 0, z: 0, kind: "hit" });
    expect(n.items[0].text).toBe("1");
    expect(n.items[1].text).toBe("13");
  });

  it("crit kind is bigger and lives longer than hit", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 10, x: 0, y: 0, z: 0, kind: "hit" });
    pushNumber(n, { value: 10, x: 0, y: 0, z: 0, kind: "crit" });
    expect(n.items[1].scale).toBeGreaterThan(n.items[0].scale);
    expect(n.items[1].life).toBeGreaterThanOrEqual(n.items[0].life);
  });

  it("heal kind renders with a plus sign", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 5, x: 0, y: 0, z: 0, kind: "heal" });
    expect(n.items[0].text).toBe("+5");
  });

  it("MERGES rapid hits on the same target: same targetId within 0.12s sums instead of stacking", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 10, x: 0, y: 0, z: 0, kind: "hit", targetId: "e1" });
    stepNumbers(n, 0.05);
    pushNumber(n, { value: 15, x: 0, y: 0, z: 0, kind: "hit", targetId: "e1" });
    expect(n.items).toHaveLength(1);
    expect(n.items[0].value).toBe(25);
    expect(n.items[0].text).toBe("25");
    expect(n.items[0].age).toBe(0);                  // merge refreshes
  });

  it("does not merge across different targets or after the merge window", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 10, x: 0, y: 0, z: 0, kind: "hit", targetId: "e1" });
    pushNumber(n, { value: 10, x: 0, y: 0, z: 0, kind: "hit", targetId: "e2" });
    expect(n.items).toHaveLength(2);
    stepNumbers(n, 0.5);
    pushNumber(n, { value: 10, x: 0, y: 0, z: 0, kind: "hit", targetId: "e1" });
    expect(n.items).toHaveLength(3);
  });

  it("a crit does not merge into a plain hit (it should pop separately)", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 10, x: 0, y: 0, z: 0, kind: "hit", targetId: "e1" });
    pushNumber(n, { value: 30, x: 0, y: 0, z: 0, kind: "crit", targetId: "e1" });
    expect(n.items).toHaveLength(2);
  });

  it("evicts the oldest when at capacity", () => {
    const n = createNumbers(3);
    for (let i = 0; i < 5; i++) { pushNumber(n, { value: i, x: 0, y: 0, z: 0, kind: "hit" }); stepNumbers(n, 0.01); }
    expect(n.items).toHaveLength(3);
    expect(n.items.map(e => e.value)).toEqual([2, 3, 4]);
  });
});

describe("stepNumbers", () => {
  it("ages entries, floats them up, and removes the expired", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 1, x: 0, y: 1, z: 0, kind: "hit" });
    const life = n.items[0].life, y0 = n.items[0].y;
    stepNumbers(n, life * 0.5);
    expect(n.items[0].y).toBeGreaterThan(y0);
    expect(n.items[0].age).toBeCloseTo(life * 0.5);
    stepNumbers(n, life);
    expect(n.items).toHaveLength(0);
  });

  it("exposes an alpha that fades toward the end of life", () => {
    const n = createNumbers(8);
    pushNumber(n, { value: 1, x: 0, y: 0, z: 0, kind: "hit" });
    const life = n.items[0].life;
    stepNumbers(n, 0.01);
    const early = n.items[0].alpha;
    stepNumbers(n, life * 0.85);
    expect(n.items[0].alpha).toBeLessThan(early);
    expect(n.items[0].alpha).toBeGreaterThanOrEqual(0);
  });
});

describe("projectToScreen", () => {
  // viewProj is a column-major 4x4 (three.js convention). Identity => x,y pass through.
  const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  it("maps NDC (0,0) to screen centre", () => {
    const p = projectToScreen({ x: 0, y: 0, z: 0 }, I, 800, 600);
    expect(p.x).toBeCloseTo(400); expect(p.y).toBeCloseTo(300); expect(p.visible).toBe(true);
  });
  it("maps NDC x=+1 to the right edge and y=+1 to the TOP (screen y is down)", () => {
    const p = projectToScreen({ x: 1, y: 1, z: 0 }, I, 800, 600);
    expect(p.x).toBeCloseTo(800); expect(p.y).toBeCloseTo(0);
  });
  it("marks points behind the camera (w <= 0 after projection) as not visible", () => {
    const flipW = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,-1];
    expect(projectToScreen({ x: 0, y: 0, z: 0 }, flipW, 800, 600).visible).toBe(false);
  });
  it("marks points outside the NDC cube as not visible", () => {
    expect(projectToScreen({ x: 2, y: 0, z: 0 }, I, 800, 600).visible).toBe(false);
  });
});
