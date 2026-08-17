// REFERENCE — never shown to the worker.
import { ITEM_BY_ID } from "./items.js";

export const STYLE_BONUSES = [
  { id: "untouchable", name: "Untouchable",  points: 500,  when: r => r.roomsCleared > 0 && r.hp >= r.maxHp },
  { id: "hoarder",     name: "Hoarder",      points: 300,  when: r => r.held.length >= 10 },
  { id: "cursed",      name: "Cursed",       points: 400,  when: r => r.held.some(id => ITEM_BY_ID[id]?.rarity === "cursed") },
  { id: "deep_diver",  name: "Deep Diver",   points: 800,  when: r => r.depthReached >= 5 },
  { id: "massacre",    name: "Massacre",     points: 350,  when: r => r.kills >= 100 },
  { id: "minimalist",  name: "Minimalist",   points: 450,  when: r => r.roomsCleared >= 5 && r.held.length <= 2 },
];

export function scoreRun(run) {
  const kills = (run.kills ?? 0) * 10;
  const rooms = (run.roomsCleared ?? 0) * 50;
  const depthMult = 1 + Math.max(0, (run.depthReached ?? 1) - 1) * 0.5;
  const bonuses = STYLE_BONUSES.filter(b => b.when(run)).map(({ id, name, points }) => ({ id, name, points }));
  const bonusTotal = bonuses.reduce((a, b) => a + b.points, 0);
  const total = Math.round((kills + rooms) * depthMult + bonusTotal * depthMult);
  return { total, breakdown: { kills, rooms, depthMult, bonuses, bonusTotal } };
}
