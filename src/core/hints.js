// First-encounter hints. One line each, shown once per browser the first time
// the thing appears - the game explains itself exactly once and then respects
// you. Data only; the shell decides when "first" is and remembers it.
//
// Tone: an operator on a bad radio, not a tutorial. Every line is the tactical
// truth about the thing, stated as advice, under ninety characters.

export const HINTS = {
  // enemies — base roster
  skitter: "Skitters rear back and glow before they lunge. That glow is your sidestep.",
  sentinel: "Sentinels charge before firing. Break line of sight, then punish.",
  brute: "Brutes soak damage and swing wide. Keep the range they can't close.",
  popper: "Poppers detonate on contact. Shoot them before they arrive.",
  warden: "Wardens block everything from the front. Flank, or make them turn.",
  wisp: "Wisps seed the floor with mines. Drop them first, then mind your feet.",
  // enemies — deep-station variants
  lurker: "Lurkers stalk in circles. Watch for the commit — it can't re-aim mid-lunge.",
  sniper: "That laser line is a promise. Move before it's kept.",
  shaman: "Shamans keep the others standing. Kill the healer first.",
  swarm: "The swarm takes turns biting. Two at a time — cull them as they come.",
  // mechanics
  sweep_beam: "The beam sweeps one way. Cross behind it, or jump the crossing.",
  extract: "Banking keeps everything you've earned. Descending bets it for more.",
  pact: "Every bargain here is real: the curse is permanent, and so is the boon.",
  forgetting: "Cursed salvage takes as it gives. Check your pockets.",
  doors: "A door’s tags are the next room’s contents. Clear it to collect the reward.",
};

export function hintFor(id) {
  return HINTS[id] ?? null;
}
