import { ITEM_BY_ID } from "core/items.js";

export const STYLE_BONUSES = [
  {
    id: "untouchable",
    name: "Untouchable",
    points: 200,
    when: (run) =>
      (run.roomsCleared ?? 0) > 0 &&
      (run.hp ?? 0) >= (run.maxHp ?? 0),
  },
  {
    id: "hoarder",
    name: "Hoarder",
    points: 150,
    when: (run) => (run.held ?? []).length >= 10,
  },
  {
    id: "cursed",
    name: "Cursed",
    points: 300,
    when: (run) =>
      (run.held ?? []).some((id) => {
        const item = ITEM_BY_ID[id];
        return item && item.rarity === "cursed";
      }),
  },
  {
    id: "deep_diver",
    name: "Deep Diver",
    points: 100,
    when: (run) => (run.depthReached ?? 0) >= 10,
  },
  {
    id: "massacre",
    name: "Massacre",
    points: 250,
    when: (run) => (run.kills ?? 0) >= 50,
  },
  {
    id: "minimalist",
    name: "Minimalist",
    points: 120,
    when: (run) =>
      (run.held ?? []).length === 0 && (run.roomsCleared ?? 0) > 0,
  },
];

export function scoreRun(run) {
  const safeRun = run ?? {};
  const kills = (safeRun.kills ?? 0) * 10;
  const rooms = (safeRun.roomsCleared ?? 0) * 50;
  const depth = safeRun.depthReached ?? 1;
  const depthMult = 1 + Math.max(0, depth - 1) * 0.5;

  const bonuses = STYLE_BONUSES.filter((bonus) => bonus.when(safeRun)).map(
    (bonus) => ({
      id: bonus.id,
      name: bonus.name,
      points: bonus.points,
    })
  );

  const bonusTotal = bonuses.reduce(
    (sum, bonus) => sum + bonus.points,
    0
  );

  const total = Math.round((kills + rooms + bonusTotal) * depthMult);

  return {
    total,
    breakdown: {
      kills,
      rooms,
      depthMult,
      bonuses,
      bonusTotal,
    },
  };
}