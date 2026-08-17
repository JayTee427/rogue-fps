const g = (s, k) => (s && typeof s[k] === "number") ? s[k] : 0;
const c01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);

export const CHALLENGES = {
  headshot_master: {
    id: "headshot_master", name: "Headshot Master",
    desc: "Get at least 25 headshot kills.", minFloor: 1,
    reward: "gold", rewardAmount: 50,
    test: s => g(s, "headshots") >= 25,
    progress: s => c01(g(s, "headshots") / 25),
  },
  no_reload_clear: {
    id: "no_reload_clear", name: "No Reload Clear",
    desc: "Clear the room without reloading.", minFloor: 2,
    reward: "item", rewardAmount: 1,
    test: s => g(s, "kills") > 0 && g(s, "reloads") === 0,
    progress: s => (g(s, "kills") > 0 && g(s, "reloads") === 0) ? 1 : c01(g(s, "kills") / 10),
  },
  speed_runner: {
    id: "speed_runner", name: "Speed Runner",
    desc: "Clear the room in 15 seconds or less.", minFloor: 1,
    reward: "gold", rewardAmount: 40,
    test: s => g(s, "kills") > 0 && g(s, "secs") <= 15,
    progress: s => {
      if (g(s, "kills") > 0 && g(s, "secs") <= 15) return 1;
      if (g(s, "kills") === 0) return 0;
      return c01((15 - g(s, "secs")) / 15);
    },
  },
  perfect_accuracy: {
    id: "perfect_accuracy", name: "Perfect Accuracy",
    desc: "Kill 10 enemies without missing a shot.", minFloor: 3,
    reward: "item", rewardAmount: 1,
    test: s => g(s, "kills") >= 10 && g(s, "shotsFired") === g(s, "shotsHit") && g(s, "shotsFired") > 0,
    progress: s => {
      if (g(s, "kills") >= 10 && g(s, "shotsFired") === g(s, "shotsHit") && g(s, "shotsFired") > 0) return 1;
      const f = g(s, "shotsFired");
      return f === 0 ? 0 : c01(g(s, "shotsHit") / f);
    },
  },
  untouchable: {
    id: "untouchable", name: "Untouchable",
    desc: "Kill 5 enemies without taking damage.", minFloor: 2,
    reward: "heal", rewardAmount: 1,
    test: s => g(s, "kills") >= 5 && g(s, "damageTaken") === 0,
    progress: s => (g(s, "kills") >= 5 && g(s, "damageTaken") === 0) ? 1 : c01(g(s, "kills") / 5),
  },
  dash_killer: {
    id: "dash_killer", name: "Dash Killer",
    desc: "Kill 15 enemies while using at least 10 dashes.", minFloor: 4,
    reward: "gold", rewardAmount: 60,
    test: s => g(s, "kills") >= 15 && g(s, "dashes") >= 10,
    progress: s => c01(Math.min(g(s, "kills") / 15, g(s, "dashes") / 10)),
  },
  item_hoarder: {
    id: "item_hoarder", name: "Item Hoarder",
    desc: "Take at least 3 items from the room.", minFloor: 1,
    reward: "item", rewardAmount: 1,
    test: s => g(s, "itemsTaken") >= 3,
    progress: s => c01(g(s, "itemsTaken") / 3),
  },
  efficient_eliminator: {
    id: "efficient_eliminator", name: "Efficient Eliminator",
    desc: "Kill 20 enemies with at most 2 shots per kill.", minFloor: 3,
    reward: "reroll", rewardAmount: 1,
    test: s => {
      const k = g(s, "kills"), f = g(s, "shotsFired");
      return k >= 20 && f > 0 && f <= 2 * k;
    },
    progress: s => {
      const k = g(s, "kills"), f = g(s, "shotsFired");
      if (k >= 20 && f > 0 && f <= 2 * k) return 1;
      if (k === 0) return 0;
      return c01(Math.min(k / 20, (2 - f / k) / 2));
    },
  },
};

export function rollChallenge(rng, floor, exclude = []) {
  const pool = Object.values(CHALLENGES).filter(c => c.minFloor <= floor && !exclude.includes(c.id));
  return pool.length === 0 ? null : rng.pick(pool);
}

export function checkChallenge(challenge, stats) {
  try { return !!challenge.test(stats || {}); } catch (e) { return false; }
}

export function challengeProgress(challenge, stats) {
  const s = stats || {};
  let frac = 0;
  try { frac = challenge.progress(s); } catch (e) { frac = 0; }
  return { frac: c01(frac), text: progressText(challenge, s) };
}

function progressText(c, s) {
  switch (c.id) {
    case "headshot_master": return `${g(s, "headshots")} / 25 headshots`;
    case "no_reload_clear": return (g(s, "kills") > 0 && g(s, "reloads") === 0) ? "Cleared without reload" : `${g(s, "kills")} / 10 kills, ${g(s, "reloads")} reloads`;
    case "speed_runner": return (g(s, "kills") > 0 && g(s, "secs") <= 15) ? `Cleared in ${g(s, "secs")}s` : `${g(s, "secs")} / 15 seconds`;
    case "perfect_accuracy": return `${g(s, "shotsHit")} / ${g(s, "shotsFired")} shots hit`;
    case "untouchable": return (g(s, "kills") >= 5 && g(s, "damageTaken") === 0) ? "Untouchable" : `${g(s, "kills")} / 5 kills, ${g(s, "damageTaken")} damage`;
    case "dash_killer": return `${g(s, "kills")} / 15 kills, ${g(s, "dashes")} / 10 dashes`;
    case "item_hoarder": return `${g(s, "itemsTaken")} / 3 items`;
    case "efficient_eliminator": return `${g(s, "kills")} / 20 kills, ${g(s, "shotsFired")} shots fired`;
    default: return "";
  }
}