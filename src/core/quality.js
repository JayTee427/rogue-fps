// src/core/quality.js

export const TIERS = {
  low: { resScale: 0.6, shadows: false, particles: 60 },
  medium: { resScale: 0.8, shadows: false, particles: 200 },
  high: { resScale: 1.0, shadows: true, particles: 600 }
};

export function pickQualityTier(benchmarkMs, hints = {}) {
  const validTiers = ["low", "medium", "high"];

  if (typeof hints.override === "string" && validTiers.includes(hints.override)) {
    return hints.override;
  }

  let tier;
  if (benchmarkMs <= 8) {
    tier = "high";
  } else if (benchmarkMs <= 25) {
    tier = "medium";
  } else {
    tier = "low";
  }

  if (hints.mobile === true) {
    if (tier === "high") {
      tier = "medium";
    }
  }

  if (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2) {
    if (tier === "high" || tier === "medium") {
      tier = "low";
    }
  }

  return tier;
}