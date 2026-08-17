import { describe, it, expect } from "vitest";
import { ITEMS } from "core/items.js";
import { FLAVOUR, flavourFor } from "core/codex.js";

describe("codex flavour text", () => {
  it("covers every item exactly once, with nothing invented", () => {
    const ids = ITEMS.map(i => i.id);
    for (const id of ids) expect(FLAVOUR[id], `no flavour line for ${id}`).toBeTruthy();
    for (const k of Object.keys(FLAVOUR)) expect(ids, `flavour for unknown item ${k}`).toContain(k);
  });

  it("lines are one sentence long, not paragraphs and not stubs", () => {
    for (const [id, line] of Object.entries(FLAVOUR)) {
      expect(typeof line, id).toBe("string");
      expect(line.length, `${id}: "${line}"`).toBeGreaterThanOrEqual(12);
      expect(line.length, `${id}: "${line}"`).toBeLessThanOrEqual(90);
      expect(line, id).not.toMatch(/\n/);
    }
  });

  it("does not simply restate the item's own description", () => {
    for (const item of ITEMS) {
      const f = FLAVOUR[item.id];
      if (f && item.desc) expect(f.toLowerCase(), item.id).not.toBe(item.desc.toLowerCase());
    }
  });

  it("lines are distinct — no copy-paste filler", () => {
    const vals = Object.values(FLAVOUR);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it("flavourFor is total: a string for anything, no throw", () => {
    expect(flavourFor(ITEMS[0].id)).toBe(FLAVOUR[ITEMS[0].id]);
    expect(flavourFor("no_such_item")).toBe("");
    expect(flavourFor(undefined)).toBe("");
    expect(flavourFor(null)).toBe("");
  });
});
