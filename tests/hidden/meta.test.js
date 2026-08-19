import { describe, it, expect } from "vitest";
import { UNLOCKS, newProfile, applyRun, isUnlocked, serializeProfile, deserializeProfile, profileSummary } from "core/meta.js";

const run = (o = {}) => ({ floorsCleared: 1, roomsCleared: 5, kills: 40, bossesKilled: 0, extracted: false, score: 500, itemsHeld: [], secs: 300, ...o });

describe("UNLOCKS", () => {
  it("has at least 10 entries, each fully described", () => {
    const keys = Object.keys(UNLOCKS);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const k of keys) {
      const u = UNLOCKS[k];
      expect(u.id, `${k} id`).toBe(k);
      expect(typeof u.name).toBe("string");
      expect(u.name.length).toBeGreaterThan(0);
      expect(typeof u.desc).toBe("string");
      expect(u.desc.length).toBeGreaterThan(0);
      expect(["weapon", "item", "cosmetic", "modifier", "start"]).toContain(u.kind);
      expect(typeof u.requires).toBe("object");
      expect(u.requires).not.toBeNull();
      expect(Object.keys(u.requires).length).toBeGreaterThan(0);
    }
  });

  it("names are unique", () => {
    const names = Object.values(UNLOCKS).map(u => u.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("at least one unlock is reachable on a first decent run, and at least one is not", () => {
    const p = newProfile();
    const easy = applyRun(p, run({ kills: 40, roomsCleared: 5, floorsCleared: 1 }));
    expect(easy.newlyUnlocked.length).toBeGreaterThan(0);
    expect(Object.keys(UNLOCKS).length).toBeGreaterThan(easy.profile.unlocked.length);
  });
});

describe("newProfile", () => {
  it("starts empty with zeroed totals", () => {
    const p = newProfile();
    expect(Array.isArray(p.unlocked)).toBe(true);
    expect(p.unlocked).toEqual([]);
    expect(p.totals.runs).toBe(0);
    expect(p.totals.kills).toBe(0);
    expect(p.totals.bestScore).toBe(0);
    expect(typeof p.version).toBe("number");
  });

  it("returns a fresh object every call", () => {
    const a = newProfile();
    a.totals.kills = 99;
    expect(newProfile().totals.kills).toBe(0);
  });
});

describe("applyRun", () => {
  it("never mutates the profile it is given", () => {
    const p = newProfile();
    const before = JSON.stringify(p);
    applyRun(p, run({ kills: 100 }));
    expect(JSON.stringify(p)).toBe(before);
  });

  it("accumulates totals across runs", () => {
    let p = newProfile();
    p = applyRun(p, run({ kills: 10, score: 100 })).profile;
    p = applyRun(p, run({ kills: 15, score: 400 })).profile;
    expect(p.totals.runs).toBe(2);
    expect(p.totals.kills).toBe(25);
    expect(p.totals.bestScore).toBe(400);
  });

  it("keeps the best score rather than the latest", () => {
    let p = applyRun(newProfile(), run({ score: 900 })).profile;
    p = applyRun(p, run({ score: 100 })).profile;
    expect(p.totals.bestScore).toBe(900);
  });

  it("reports each unlock exactly once, and never removes one", () => {
    let p = newProfile();
    const seen = [];
    for (let i = 0; i < 12; i++) {
      const r = applyRun(p, run({ kills: 200, floorsCleared: 5, bossesKilled: 3, extracted: true, score: 9000 }));
      seen.push(...r.newlyUnlocked);
      expect(r.profile.unlocked.length).toBeGreaterThanOrEqual(p.unlocked.length);
      p = r.profile;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(p.unlocked).size).toBe(p.unlocked.length);
  });

  it("newlyUnlocked ids all exist in UNLOCKS and land in profile.unlocked", () => {
    const r = applyRun(newProfile(), run({ kills: 500, floorsCleared: 9, bossesKilled: 3, extracted: true, score: 99999 }));
    for (const id of r.newlyUnlocked) {
      expect(UNLOCKS[id], `unknown unlock ${id}`).toBeDefined();
      expect(r.profile.unlocked).toContain(id);
    }
  });

  it("a do-nothing run unlocks nothing", () => {
    const r = applyRun(newProfile(), run({ kills: 0, roomsCleared: 0, floorsCleared: 0, score: 0, bossesKilled: 0, extracted: false }));
    expect(r.newlyUnlocked).toEqual([]);
  });

  it("survives a junk run summary", () => {
    expect(() => applyRun(newProfile(), {})).not.toThrow();
    const r = applyRun(newProfile(), {});
    expect(r.profile.totals.runs).toBe(1);
    expect(Number.isFinite(r.profile.totals.kills)).toBe(true);
  });
});

describe("isUnlocked", () => {
  it("is false on a fresh profile and true once earned", () => {
    const p = newProfile();
    const id = Object.keys(UNLOCKS)[0];
    expect(isUnlocked(p, id)).toBe(false);
    expect(isUnlocked({ ...p, unlocked: [id] }, id)).toBe(true);
  });

  it("returns false for an unknown id rather than throwing", () => {
    expect(isUnlocked(newProfile(), "no_such_unlock")).toBe(false);
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a profile exactly", () => {
    const p = applyRun(newProfile(), run({ kills: 33, score: 777 })).profile;
    expect(deserializeProfile(serializeProfile(p))).toEqual(p);
  });

  it("produces a string", () => {
    expect(typeof serializeProfile(newProfile())).toBe("string");
  });

  it("returns a fresh profile for corrupt or empty input instead of throwing", () => {
    for (const junk of ["", "{{{", "null", undefined, "[]", '{"unlocked":"nope"}']) {
      const p = deserializeProfile(junk);
      expect(Array.isArray(p.unlocked), String(junk)).toBe(true);
      expect(typeof p.totals).toBe("object");
      expect(Number.isFinite(p.totals.runs)).toBe(true);
    }
  });

  it("drops unlock ids that no longer exist in the table", () => {
    const p = { version: 1, unlocked: ["ghost_unlock_from_an_old_build"], totals: { runs: 1, kills: 1, bestScore: 1 } };
    expect(deserializeProfile(JSON.stringify(p)).unlocked).not.toContain("ghost_unlock_from_an_old_build");
  });
});

describe("profileSummary", () => {
  it("describes progress without throwing on a fresh profile", () => {
    const s = profileSummary(newProfile());
    expect(typeof s.text).toBe("string");
    expect(s.text.length).toBeGreaterThan(0);
    expect(s.unlockedCount).toBe(0);
    expect(s.totalCount).toBe(Object.keys(UNLOCKS).length);
  });
});

// The previous table granted nothing at all - twelve unlocks that were
// achievements wearing a costume. Every one now hands the next run something
// real, and every reference has to point at content that exists.
describe("unlocks grant real things", () => {
  it("every weapon granted is a real archetype", async () => {
    const { ARCHETYPES } = await import("core/weapons.js");
    for (const u of Object.values(UNLOCKS)) {
      if (u.grants?.weapon) {
        expect(ARCHETYPES[u.grants.weapon], `${u.id} grants unknown weapon ${u.grants.weapon}`).toBeDefined();
      }
    }
  });

  it("every item granted is a real item", async () => {
    const { ITEM_BY_ID } = await import("core/items.js");
    for (const u of Object.values(UNLOCKS)) {
      if (u.grants?.item) {
        expect(ITEM_BY_ID[u.grants.item], `${u.id} grants unknown item ${u.grants.item}`).toBeDefined();
      }
    }
  });

  it("every non-cosmetic unlock actually grants something", () => {
    for (const u of Object.values(UNLOCKS)) {
      if (u.kind === "cosmetic") continue;
      expect(Object.keys(u.grants ?? {}).length, `${u.id} is not cosmetic but grants nothing`).toBeGreaterThan(0);
    }
  });
});

describe("grantsFor", () => {
  it("is empty and harmless for a fresh profile", async () => {
    const { grantsFor } = await import("core/meta.js");
    const g = grantsFor(newProfile());
    expect(g.weapons).toEqual([]);
    expect(g.items).toEqual([]);
    expect(g.gold).toBe(0);
    expect(g.maxHp).toBe(0);
  });

  it("collects everything the owned unlocks give", async () => {
    const { grantsFor } = await import("core/meta.js");
    const owned = Object.keys(UNLOCKS);
    const g = grantsFor({ unlocked: owned });
    expect(g.weapons.length).toBeGreaterThan(0);
    expect(g.items.length).toBeGreaterThan(0);
    expect(g.gold).toBeGreaterThan(0);
    expect(g.maxHp).toBeGreaterThan(0);
    for (const v of [g.gold, g.maxHp, g.draftSize, g.rerolls]) expect(Number.isFinite(v)).toBe(true);
  });

  it("survives junk without throwing", async () => {
    const { grantsFor } = await import("core/meta.js");
    for (const junk of [null, undefined, {}, { unlocked: "nope" }, { unlocked: [null, "ghost"] }]) {
      expect(() => grantsFor(junk), String(junk)).not.toThrow();
      expect(Array.isArray(grantsFor(junk).weapons)).toBe(true);
    }
  });
});
