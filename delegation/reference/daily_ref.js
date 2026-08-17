// REFERENCE — never shown to the worker.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function dailySeed(date = new Date()) {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function formatSeed(seed) {
  let n = seed >>> 0, out = "";
  do { out = ALPHABET[n % 36] + out; n = Math.floor(n / 36); } while (n > 0);
  return out;
}

export function parseSeed(text) {
  if (typeof text !== "string") return null;
  const t = text.trim().toUpperCase();
  if (!t) return null;
  if (!/^[A-Z0-9]+$/.test(t)) return null;
  let n = 0;
  for (const ch of t) n = n * 36 + ALPHABET.indexOf(ch);
  return n >>> 0;
}
