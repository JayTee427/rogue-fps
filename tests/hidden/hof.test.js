import { describe, it, expect } from "vitest";
import { MAX_ENTRIES, newTable, qualifies, rank, addEntry, sanitizeInitials, serializeTable, deserializeTable, topLine } from "core/hof.js";

const run = (score, o = {}) => ({ initials: "ABC", score, floor: 2, kills: 30, secs: 200, ...o });
const fill = (n, from = 1000) => {
  let t = newTable();
  for (let i = 0; i < n; i++) t = addEntry(t, run(from - i * 10, { at: i }));
  return t;
};

describe("sanitizeInitials", () => {
  it("takes three upper-case characters", () => {
    expect(sanitizeInitials("jtb")).toBe("JTB");
    expect(sanitizeInitials("ABCDEF")).toBe("ABC");
  });

  it("pads short entries rather than leaving a ragged board", () => {
    expect(sanitizeInitials("J")).toBe("J__");
    expect(sanitizeInitials("JT")).toBe("JT_");
  });

  it("strips anything that is not a letter or digit", () => {
    expect(sanitizeInitials("a!b@c")).toBe("ABC");
    expect(sanitizeInitials("<script>")).toBe("SCR");
  });

  it("falls back to AAA for junk, and never throws", () => {
    for (const junk of [null, undefined, "", "   ", "!!!", 42, {}, []]) {
      const out = sanitizeInitials(junk);
      expect(out.length, String(junk)).toBe(3);
      expect(typeof out).toBe("string");
    }
  });
});

describe("qualifies", () => {
  it("takes any positive score onto an empty board", () => {
    expect(qualifies(newTable(), 1)).toBe(true);
    expect(qualifies(newTable(), 0)).toBe(false);
    expect(qualifies(newTable(), -5)).toBe(false);
  });

  it("refuses a score below a full board's last place", () => {
    const full = fill(MAX_ENTRIES);
    const lowest = full.entries[full.entries.length - 1].score;
    expect(qualifies(full, lowest - 1)).toBe(false);
    expect(qualifies(full, lowest + 1)).toBe(true);
  });

  it("survives junk input", () => {
    for (const j of [null, undefined, NaN, "abc"]) expect(qualifies(newTable(), j)).toBe(false);
    expect(() => qualifies(null, 100)).not.toThrow();
  });
});

describe("addEntry", () => {
  it("sorts by score, highest first", () => {
    let t = newTable();
    for (const s of [300, 900, 100, 500]) t = addEntry(t, run(s));
    expect(t.entries.map((e) => e.score)).toEqual([900, 500, 300, 100]);
  });

  it("caps the board and drops the weakest", () => {
    const t = addEntry(fill(MAX_ENTRIES), run(999999));
    expect(t.entries.length).toBe(MAX_ENTRIES);
    expect(t.entries[0].score).toBe(999999);
  });

  it("never mutates the table it was given", () => {
    const t = fill(3);
    const before = JSON.stringify(t);
    addEntry(t, run(5000));
    expect(JSON.stringify(t)).toBe(before);
  });

  it("keeps the earlier run higher on a tie - first there owns the slot", () => {
    let t = newTable();
    t = addEntry(t, run(500, { initials: "OLD", at: 1 }));
    t = addEntry(t, run(500, { initials: "NEW", at: 2 }));
    expect(t.entries[0].initials).toBe("OLD");
  });

  it("normalises every field and never stores NaN", () => {
    const t = addEntry(newTable(), { initials: "zz", score: "700", floor: null, kills: NaN, secs: -4 });
    const e = t.entries[0];
    expect(e.initials).toBe("ZZ_");
    expect(e.score).toBe(700);
    expect(e.floor).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(e.kills)).toBe(true);
    expect(e.secs).toBeGreaterThanOrEqual(0);
  });

  it("accepts a completely empty entry without throwing", () => {
    expect(() => addEntry(newTable(), {})).not.toThrow();
    expect(() => addEntry(newTable(), null)).not.toThrow();
  });
});

describe("rank", () => {
  it("reports where a score would land", () => {
    let t = newTable();
    for (const s of [900, 500, 100]) t = addEntry(t, run(s));
    expect(rank(t, 1000)).toBe(1);
    expect(rank(t, 600)).toBe(2);
    expect(rank(t, 50)).toBe(4);
  });

  it("is null for a score that would not make the board", () => {
    expect(rank(newTable(), 0)).toBeNull();
    const full = fill(MAX_ENTRIES);
    expect(rank(full, full.entries[MAX_ENTRIES - 1].score - 1)).toBeNull();
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a board", () => {
    const t = fill(5);
    expect(deserializeTable(serializeTable(t))).toEqual(t);
  });

  it("returns an empty board for anything corrupt instead of throwing", () => {
    for (const junk of ["", "{{{", "null", undefined, "[]", '{"entries":"nope"}']) {
      const t = deserializeTable(junk);
      expect(Array.isArray(t.entries), String(junk)).toBe(true);
      expect(t.entries.length).toBe(0);
    }
  });

  it("drops malformed rows and re-sorts what survives", () => {
    const raw = JSON.stringify({ entries: [
      { initials: "AAA", score: 100, at: 1 },
      { nonsense: true },
      { initials: "BBB", score: 900, at: 2 },
      { initials: "CCC", score: "not a number" },
    ]});
    const t = deserializeTable(raw);
    expect(t.entries.map((e) => e.initials)).toEqual(["BBB", "AAA"]);
  });

  it("re-sanitises initials loaded from storage - a hand-edited file cannot inject markup", () => {
    const raw = JSON.stringify({ entries: [{ initials: "<img src=x>", score: 100 }] });
    expect(deserializeTable(raw).entries[0].initials).toBe("IMG");
  });
});

describe("topLine", () => {
  it("names the run to beat", () => {
    const t = addEntry(newTable(), run(4200, { initials: "JTB", floor: 3 }));
    expect(topLine(t)).toContain("JTB");
    expect(topLine(t)).toContain("4,200");
  });

  it("says so when the board is empty", () => {
    expect(typeof topLine(newTable())).toBe("string");
    expect(topLine(newTable()).length).toBeGreaterThan(0);
    expect(topLine(null).length).toBeGreaterThan(0);
  });
});
