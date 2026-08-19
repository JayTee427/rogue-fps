// HOLLOW SIGNAL — who is playing, and what they keep: pilot profiles,
// device PINs, and the hall of fame. Nothing here knows about combat.

import { $, toast, G } from "./context.js";
import { SFX } from "./audio.js";
import { qualifies, rank, addEntry, sanitizeInitials, serializeTable, deserializeTable, topLine, MAX_ENTRIES } from "core/hof.js";
import { newProfile, applyRun, grantsFor, serializeProfile, deserializeProfile, profileSummary } from "core/meta.js";

let hof = deserializeTable(localStorage.getItem("hs_hof"));

// The pilot currently signed in, or null for an anonymous run. Profiles are keyed
// by initials in localStorage - a shared cabinet, not an account system.
let pilot = null;
let profile = newProfile();

const profileKey = (initials) => `hs_pilot_${sanitizeInitials(initials)}`;

/** Only ever compared against itself, never sent anywhere. Stored scrambled so a
 *  casual glance at localStorage does not reveal it - NOT a security measure, and
 *  the UI does not claim otherwise. */
function scramblePin(pin, initials) {
  const s = `${initials}:${String(pin)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function pilotHasPin(initials) {
  const raw = localStorage.getItem(profileKey(initials));
  try { return !!JSON.parse(raw ?? "null")?.pin; } catch { return false; }
}

function pinMatches(initials, pin) {
  const raw = localStorage.getItem(profileKey(initials));
  try {
    const stored = JSON.parse(raw ?? "null")?.pin;
    return !stored || stored === scramblePin(pin, sanitizeInitials(initials));
  } catch { return true; }
}

function signIn(initials, { trusted = false } = {}) {
  const who = sanitizeInitials(initials);
  const stored = localStorage.getItem(profileKey(who));
  // A PIN is only asked for when this browser does not already know you. The
  // device that has been playing all along is not interrogated every session.
  if (!trusted && stored && pilotHasPin(who)) return { needsPin: true, who };
  pilot = who;
  profile = deserializeProfile(stored);
  // deserializeProfile drops fields it does not know about, so carry the pin over
  try { const raw = JSON.parse(stored ?? "null"); if (raw?.pin) profile.pin = raw.pin; } catch {}
  localStorage.setItem("hs_last_pilot", pilot);
  saveProfile();
  updatePilotLine();
  return { ok: true, who };
}

function signOut() {
  pilot = null;
  profile = newProfile();
  localStorage.removeItem("hs_last_pilot");
  updatePilotLine();
}

function saveProfile() {
  if (!pilot) return;
  // serializeProfile only knows the fields core/meta.js defines, so the pin is
  // merged back in rather than being silently dropped on every save.
  const body = JSON.parse(serializeProfile(profile));
  if (profile.pin) body.pin = profile.pin;
  localStorage.setItem(profileKey(pilot), JSON.stringify(body));
}

function updatePilotLine() {
  const el = $("#pilotLine");
  if (!el) return;
  if (!pilot) { el.textContent = ""; return; }
  const g = grantsFor(profile);
  const bits = [];
  if (g.weapons.length) bits.push(`${g.weapons.length} weapon${g.weapons.length > 1 ? "s" : ""}`);
  if (g.items.length) bits.push(`${g.items.length} item${g.items.length > 1 ? "s" : ""}`);
  if (g.gold) bits.push(`${g.gold} salvage`);
  if (g.maxHp) bits.push(`+${g.maxHp} hp`);
  el.textContent = `${pilot} — ${profileSummary(profile).text}${bits.length ? " · carrying " + bits.join(", ") : ""}`;
}
// Achievements are earned WITHIN a run and travel with the score. Nothing
// carries between players, because the next player is a stranger.

function commitEntry() {
  if (!G.pendingEntry) return;
  const initials = sanitizeInitials($("#initials")?.value);
  hof = addEntry(hof, { ...G.pendingEntry, initials, at: Date.now() });
  localStorage.setItem("hs_hof", serializeTable(hof));
  // Claim these initials as a pilot, and optionally lock them to a PIN. Signing
  // in here means the next run carries whatever this run earned.
  const wantPin = ($("#setPin")?.value ?? "").trim();
  const alreadyKnown = !!localStorage.getItem(profileKey(initials));
  if (!alreadyKnown || pilot === initials) {
    signIn(initials, { trusted: true });
    if (wantPin.length >= 3) {
      profile.pin = scramblePin(wantPin, initials);
      saveProfile();
      toast(`${initials} locked with a PIN on this device`, false, 3000);
    }
  }
  G.pendingEntry = null;
  $("#initialsRow").classList.add("hidden");
  $("#repRank").textContent = `${initials} RECORDED`;
  SFX.pickup();
  renderHof();
  updatePilotLine();
}

function renderHof() {
  const wrap = $("#hofRows");
  if (!wrap) return;
  const rows = hof.entries ?? [];
  wrap.innerHTML = rows.length
    ? rows.map((e, i) => {
        const when = new Date(e.at || 0);
        const date = e.at ? `${when.getDate()}/${when.getMonth() + 1}` : "";
        return `<div class="hrow${i === 0 ? " first" : ""}">
          <span class="pos">${String(i + 1).padStart(2, "0")}</span>
          <span class="ini">${e.initials}</span>
          <span class="sc">${e.score.toLocaleString()}</span>
          <span class="fl">floor ${e.floor}${e.extracted ? " ✓" : ""}</span>
          <span class="kd">${e.kills} kills</span>
          <span class="dt">${date}</span>
        </div>`;
      }).join("")
    : '<div class="hrow"><span class="ini">—</span><span class="sc">no runs recorded yet</span></div>';
  const line = $("#bestLine");
  if (line) line.textContent = `BEST — ${topLine(hof)}`;
}


/** Would this score make the hall of fame, and where? */
export function boardPlace(score) {
  return { qualifies: qualifies(hof, score), place: rank(hof, score), of: MAX_ENTRIES };
}

/** The signed-in pilot's name, or null. */
export function getPilot() { return pilot; }
/** Everything the pilot's unlocks grant a new run. */
export function pilotGrants() { return grantsFor(profile); }
/** Credit a finished run to the signed-in pilot; returns newly unlocked ids. */
export function creditRun(summary) {
  if (!pilot) return [];
  const res = applyRun(profile, summary);
  profile = res.profile;
  saveProfile();
  return res.newlyUnlocked;
}
/** Restore whoever last played on this browser. */
export function autoSignIn() {
  const remembered = localStorage.getItem("hs_last_pilot");
  if (remembered) signIn(remembered, { trusted: true });
}

// ---- sign-in / hall-of-fame wiring -----------------------------------------
$("#btnContinue").addEventListener("click", () => { $("#signinRow").classList.toggle("hidden"); const b = $("#pilotInitials"); if (b) { b.value = pilot ?? ""; setTimeout(() => b.focus(), 60); } });
$("#btnSignIn").addEventListener("click", () => {
  const v = $("#pilotInitials")?.value;
  if (!v || !v.trim()) return;
  const pinBox = $("#pinEntry");
  const res = signIn(v, { trusted: false });
  if (res.needsPin) {
    // Ask once, here, rather than pretending the name alone was enough.
    pinBox.classList.remove("hidden");
    $("#pinMsg").textContent = `${res.who} is locked on this device — enter their PIN`;
    setTimeout(() => $("#pinInput").focus(), 60);
    return;
  }
  pinBox.classList.add("hidden");
  $("#signinRow").classList.add("hidden");
  SFX.ui();
});

$("#btnPinOk").addEventListener("click", () => {
  const who = $("#pilotInitials")?.value, pin = $("#pinInput")?.value;
  if (!pinMatches(who, pin)) {
    $("#pinMsg").textContent = "that PIN does not match — try again, or start a new run";
    SFX.empty();
    return;
  }
  signIn(who, { trusted: true });
  $("#pinEntry").classList.add("hidden");
  $("#signinRow").classList.add("hidden");
  SFX.ui();
});
$("#btnSignOut").addEventListener("click", () => { signOut(); SFX.ui(); });
$("#pilotInitials").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3); });
$("#pilotInitials").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btnSignIn").click(); });
$("#btnEnter").addEventListener("click", commitEntry);
$("#initials").addEventListener("keydown", (e) => { if (e.key === "Enter") commitEntry(); });
$("#initials").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3); });

export { signIn, signOut, updatePilotLine, renderHof, commitEntry };
