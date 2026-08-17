// src/core/daily.js

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function fnv1a(str) {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), FNV_PRIME);
  }
  return hash >>> 0;
}

export function dailySeed(date = new Date()) {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  return fnv1a(key);
}

export function formatSeed(seed) {
  return (seed >>> 0).toString(36).toUpperCase();
}

export function parseSeed(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90))) return null;
  }
  return parseInt(trimmed, 36) >>> 0;
}