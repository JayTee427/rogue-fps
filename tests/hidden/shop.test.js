import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { ITEM_BY_ID } from "core/items.js";
import { PRICES, rollStock, priceOf, buy, rerollStock, REROLL_COST } from "core/shop.js";

const R = (s = 5) => rng(s);
const run = (o = {}) => ({ floor: 2, gold: 200, held: [], rerolls: 0, ...o });

describe("PRICES", () => {
  it("prices every rarity, and rarer costs more", () => {
    for (const r of ["common", "uncommon", "rare", "legendary"]) {
      expect(PRICES[r], `no price for ${r}`).toBeGreaterThan(0);
    }
    expect(PRICES.uncommon).toBeGreaterThan(PRICES.common);
    expect(PRICES.rare).toBeGreaterThan(PRICES.uncommon);
    expect(PRICES.legendary).toBeGreaterThan(PRICES.rare);
  });
});

describe("priceOf", () => {
  it("returns a positive whole number for any offer", () => {
    for (const kind of ["item", "heal", "reroll", "weapon"]) {
      const p = priceOf({ kind, rarity: "rare" }, 3);
      expect(Number.isFinite(p), kind).toBe(true);
      expect(p).toBeGreaterThan(0);
      expect(Math.round(p)).toBe(p);
    }
  });

  it("charges more on deeper floors", () => {
    expect(priceOf({ kind: "item", rarity: "rare" }, 5)).toBeGreaterThan(priceOf({ kind: "item", rarity: "rare" }, 1));
  });

  it("never throws on an unknown rarity", () => {
    expect(() => priceOf({ kind: "item", rarity: "nonsense" }, 2)).not.toThrow();
    expect(priceOf({ kind: "item", rarity: "nonsense" }, 2)).toBeGreaterThan(0);
  });
});

describe("rollStock", () => {
  it("stocks 3 to 6 offers, all well formed", () => {
    for (let s = 0; s < 25; s++) {
      const stock = rollStock(R(s), run({ floor: 1 + (s % 5) }));
      expect(stock.length).toBeGreaterThanOrEqual(3);
      expect(stock.length).toBeLessThanOrEqual(6);
      for (const o of stock) {
        expect(["item", "weapon", "heal", "reroll"]).toContain(o.kind);
        expect(o.price).toBeGreaterThan(0);
        expect(Math.round(o.price)).toBe(o.price);
        expect(o.sold).toBe(false);
        if (o.kind === "item") expect(ITEM_BY_ID[o.id], `unknown item ${o.id}`).toBeDefined();
      }
    }
  });

  it("always offers at least one item — a shop with nothing to buy is not a shop", () => {
    for (let s = 0; s < 25; s++) {
      expect(rollStock(R(s), run()).some(o => o.kind === "item"), `seed ${s}`).toBe(true);
    }
  });

  it("never stocks an item the player already holds", () => {
    const held = ["hot_rounds", "overclock", "crit_lens", "plating", "bottomless"];
    for (let s = 0; s < 30; s++) {
      for (const o of rollStock(R(s), run({ held }))) {
        if (o.kind === "item") expect(held, `seed ${s} restocked a held item`).not.toContain(o.id);
      }
    }
  });

  it("never stocks the same item twice in one shop", () => {
    for (let s = 0; s < 25; s++) {
      const ids = rollStock(R(s), run()).filter(o => o.kind === "item").map(o => o.id);
      expect(new Set(ids).size, `seed ${s}`).toBe(ids.length);
    }
  });

  it("never sells a cursed item — curses are taken freely, not bought", () => {
    for (let s = 0; s < 30; s++) {
      for (const o of rollStock(R(s), run({ floor: 5 }))) {
        if (o.kind === "item") expect(ITEM_BY_ID[o.id].rarity, `seed ${s}`).not.toBe("cursed");
      }
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(rollStock(R(9), run())).toEqual(rollStock(R(9), run()));
    expect(JSON.stringify(rollStock(R(1), run()))).not.toBe(JSON.stringify(rollStock(R(42), run())));
  });

  it("does not mutate the run it reads", () => {
    const r = run({ held: ["hot_rounds"] });
    const copy = JSON.parse(JSON.stringify(r));
    rollStock(R(3), r);
    expect(r).toEqual(copy);
  });
});

describe("buy", () => {
  const stockOf = (s = 4) => rollStock(R(s), run());

  it("takes the gold, marks the offer sold, and reports what was bought", () => {
    const stock = stockOf();
    const i = stock.findIndex(o => o.kind === "item");
    const res = buy({ gold: 9999, stock, held: [] }, i);
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(9999 - stock[i].price);
    expect(res.stock[i].sold).toBe(true);
    expect(res.bought.kind).toBe("item");
    expect(res.bought.id).toBe(stock[i].id);
  });

  it("refuses when the player cannot afford it, changing nothing", () => {
    const stock = stockOf();
    const res = buy({ gold: 0, stock, held: [] }, 0);
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.gold).toBe(0);
    expect(res.stock[0].sold).toBe(false);
  });

  it("refuses to sell the same offer twice", () => {
    const stock = stockOf();
    const first = buy({ gold: 9999, stock, held: [] }, 0);
    const second = buy({ gold: first.gold, stock: first.stock, held: [] }, 0);
    expect(second.ok).toBe(false);
    expect(second.gold).toBe(first.gold);
  });

  it("refuses an index that is not in the stock", () => {
    const stock = stockOf();
    for (const i of [-1, 99, null, undefined, "0"]) {
      const res = buy({ gold: 9999, stock, held: [] }, i);
      expect(res.ok, `index ${i}`).toBe(false);
    }
  });

  it("never mutates the stock or state it was given", () => {
    const stock = stockOf();
    const before = JSON.stringify(stock);
    buy({ gold: 9999, stock, held: [] }, 0);
    expect(JSON.stringify(stock)).toBe(before);
  });

  it("gold never goes negative on any purchase from any seed", () => {
    for (let s = 0; s < 20; s++) {
      const stock = stockOf(s);
      let gold = 120, cur = stock;
      for (let i = 0; i < cur.length; i++) {
        const res = buy({ gold, stock: cur, held: [] }, i);
        if (res.ok) { gold = res.gold; cur = res.stock; }
        expect(gold, `seed ${s}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("rerollStock", () => {
  it("costs REROLL_COST and returns fresh unsold stock", () => {
    expect(REROLL_COST).toBeGreaterThan(0);
    const res = rerollStock(R(2), { gold: 500, stock: rollStock(R(2), run()), run: run() });
    expect(res.ok).toBe(true);
    expect(res.gold).toBe(500 - REROLL_COST);
    expect(res.stock.every(o => o.sold === false)).toBe(true);
    expect(res.stock.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses when the player cannot afford the reroll", () => {
    const stock = rollStock(R(2), run());
    const res = rerollStock(R(2), { gold: 0, stock, run: run() });
    expect(res.ok).toBe(false);
    expect(res.gold).toBe(0);
    expect(res.stock).toEqual(stock);
  });
});
