/** Illustrative paid-social CTR benchmarks by category (labeled as such).
 * Shared by the results screen and the weekly intel report. */
export const CTR_BENCHMARKS: Record<string, number> = {
  "Restaurants & cafés": 0.016,
  "Home services": 0.012,
  "Health & beauty": 0.018,
  "Fitness studios": 0.017,
  "Retail & boutiques": 0.015,
  "Auto services": 0.011,
  "Dental & wellness": 0.013,
};

export const benchmarkFor = (category: string): number => CTR_BENCHMARKS[category] ?? 0.015;
