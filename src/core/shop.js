import { ITEMS, ITEM_BY_ID } from "core/items.js";

export const PRICES = {
  common: 25,
  uncommon: 45,
  rare: 80,
  legendary: 140,
};

export const REROLL_COST = 50;

export function priceOf(offer, floor) {
  const rarity = offer.rarity || "common";
  const base = PRICES[rarity] !== undefined ? PRICES[rarity] : PRICES.common;
  const multiplier = 1 + (floor - 1) * 0.15;
  return Math.round(base * multiplier);
}

export function rollStock(rng, run) {
  const heldSet = new Set(run.held);
  const available = ITEMS.filter(
    (item) => !heldSet.has(item.id) && item.rarity !== "cursed"
  );

  const offers = [];

  // Always at least one item offer
  const itemCandidates = available.filter((item) => item.tags && item.tags.includes("item"));
  const itemPool = itemCandidates.length > 0 ? itemCandidates : available;
  const chosenItem = rng.pick(itemPool);
  offers.push({
    kind: "item",
    id: chosenItem.id,
    rarity: chosenItem.rarity,
    price: priceOf({ kind: "item", rarity: chosenItem.rarity }, run.floor),
    sold: false,
  });

  // Optional weapon offer (at most one)
  const weaponCandidates = available.filter(
    (item) => item.tags && item.tags.includes("weapon")
  );
  if (weaponCandidates.length > 0 && rng.chance(0.5)) {
    const weapon = rng.pick(weaponCandidates);
    offers.push({
      kind: "weapon",
      id: weapon.id,
      rarity: weapon.rarity,
      price: priceOf({ kind: "weapon", rarity: weapon.rarity }, run.floor),
      sold: false,
    });
  }

  // Heal offer
  const healCandidates = available.filter(
    (item) => item.tags && item.tags.includes("heal")
  );
  if (healCandidates.length > 0 && rng.chance(0.6)) {
    const heal = rng.pick(healCandidates);
    offers.push({
      kind: "heal",
      id: heal.id,
      rarity: heal.rarity,
      price: priceOf({ kind: "heal", rarity: heal.rarity }, run.floor),
      sold: false,
    });
  }

  // Reroll offer
  if (rng.chance(0.4)) {
    offers.push({
      kind: "reroll",
      price: REROLL_COST,
      sold: false,
    });
  }

  // Ensure between 3 and 6 offers
  while (offers.length < 3) {
    const extra = rng.pick(available);
    if (!offers.some((o) => o.id === extra.id)) {
      offers.push({
        kind: "item",
        id: extra.id,
        rarity: extra.rarity,
        price: priceOf({ kind: "item", rarity: extra.rarity }, run.floor),
        sold: false,
      });
    }
  }

  return offers.slice(0, 6);
}

export function buy(state, index) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.stock.length
  ) {
    return { ok: false, error: "invalid index", gold: state.gold, stock: state.stock };
  }

  const offer = state.stock[index];
  if (offer.sold) {
    return { ok: false, error: "already sold", gold: state.gold, stock: state.stock };
  }

  if (state.gold < offer.price) {
    return { ok: false, error: "not enough gold", gold: state.gold, stock: state.stock };
  }

  const newStock = state.stock.map((o, i) =>
    i === index ? { ...o, sold: true } : { ...o }
  );
  const newGold = state.gold - offer.price;

  return {
    ok: true,
    gold: newGold,
    stock: newStock,
    bought: { ...offer },
  };
}

export function rerollStock(rng, state) {
  if (state.gold < REROLL_COST) {
    return { ok: false, gold: state.gold, stock: state.stock };
  }

  const newStock = rollStock(rng, state.run);
  return {
    ok: true,
    gold: state.gold - REROLL_COST,
    stock: newStock,
  };
}