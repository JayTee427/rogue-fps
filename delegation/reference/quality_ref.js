// REFERENCE — never shown to the worker.
export const TIERS = {
  low:    { resScale: 0.6,  shadows: false, particles: 60,  msaa: false },
  medium: { resScale: 0.8,  shadows: false, particles: 200, msaa: false },
  high:   { resScale: 1.0,  shadows: true,  particles: 600, msaa: true },
};

export function pickQualityTier(benchmarkMs, hints = {}) {
  if (hints.override && TIERS[hints.override]) return hints.override;
  let tier = benchmarkMs <= 8 ? "high" : benchmarkMs <= 25 ? "medium" : "low";
  const cap = t => { const order = ["low", "medium", "high"]; if (order.indexOf(tier) > order.indexOf(t)) tier = t; };
  if (hints.mobile) cap("medium");
  if (hints.deviceMemory != null && hints.deviceMemory <= 2) cap("low");
  return tier;
}
