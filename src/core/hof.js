// The hall of fame. Every run is anonymous until it ends; if it scored well
// enough you put three letters on it, arcade style. No accounts, no logins, no
// assumption that the person holding the mouse is the same one as last time.
//
// Deliberately NOT a global leaderboard. This game is entirely client-side, so a
// global board could be forged by anyone with devtools open, which would make the
// honest scores worthless. A local cabinet is honest about what it is.

export const MAX_ENTRIES = 20;
const ALLOWED = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Three characters, upper case, padded. Anything unusable becomes AAA. */
export function sanitizeInitials(raw) {
  const cleaned = String(raw ?? "")
    .toUpperCase()
    .split("")
    .filter((ch) => ALLOWED.includes(ch))
    .slice(0, 3)
    .join("");
  return cleaned.length ? cleaned.padEnd(3, "_") : "AAA";
}

export function newTable() {
  return { version: 1, entries: [] };
}

/** Would this score make the board? An empty board takes anything above zero. */
export function qualifies(table, score) {
  const s = Number(score);
  if (!Number.isFinite(s) || s <= 0) return false;
  const entries = table?.entries ?? [];
  if (entries.length < MAX_ENTRIES) return true;
  return s > entries[entries.length - 1].score;
}

/** 1-based position a score would take, or null if it would not make the board. */
export function rank(table, score) {
  if (!qualifies(table, score)) return null;
  const entries = table?.entries ?? [];
  let i = 0;
  while (i < entries.length && entries[i].score >= score) i++;
  return i + 1;
}

/** Returns a NEW table with the run inserted, sorted and capped. Never mutates. */
export function addEntry(table, entry) {
  const base = Array.isArray(table?.entries) ? table.entries : [];
  const row = {
    initials: sanitizeInitials(entry?.initials),
    score: Math.max(0, Math.round(Number(entry?.score) || 0)),
    floor: Math.max(1, Math.round(Number(entry?.floor) || 1)),
    kills: Math.max(0, Math.round(Number(entry?.kills) || 0)),
    secs: Math.max(0, Math.round(Number(entry?.secs) || 0)),
    extracted: !!entry?.extracted,
    achievements: Array.isArray(entry?.achievements) ? entry.achievements.slice(0, 12) : [],
    at: Number.isFinite(Number(entry?.at)) ? Number(entry.at) : Date.now(),
  };
  // Ties keep the older run higher: first to get there owns the slot.
  const entries = [...base, row]
    .sort((a, b) => (b.score - a.score) || (a.at - b.at))
    .slice(0, MAX_ENTRIES);
  return { version: 1, entries };
}

export function serializeTable(table) {
  return JSON.stringify(table ?? newTable());
}

/** Any corruption yields an empty board rather than throwing into the menu. */
export function deserializeTable(text) {
  try {
    const raw = JSON.parse(String(text ?? ""));
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.entries)) return newTable();
    const entries = raw.entries
      .filter((e) => e && typeof e === "object" && Number.isFinite(Number(e.score)))
      .map((e) => ({
        initials: sanitizeInitials(e.initials),
        score: Math.max(0, Math.round(Number(e.score) || 0)),
        floor: Math.max(1, Math.round(Number(e.floor) || 1)),
        kills: Math.max(0, Math.round(Number(e.kills) || 0)),
        secs: Math.max(0, Math.round(Number(e.secs) || 0)),
        extracted: !!e.extracted,
        achievements: Array.isArray(e.achievements) ? e.achievements.slice(0, 12) : [],
        at: Number.isFinite(Number(e.at)) ? Number(e.at) : 0,
      }))
      .sort((a, b) => (b.score - a.score) || (a.at - b.at))
      .slice(0, MAX_ENTRIES);
    return { version: 1, entries };
  } catch {
    return newTable();
  }
}

/** One line for the title screen: the run to beat. */
export function topLine(table) {
  const top = table?.entries?.[0];
  if (!top) return "no runs recorded";
  return `${top.initials} · ${top.score.toLocaleString()} · floor ${top.floor}`;
}
