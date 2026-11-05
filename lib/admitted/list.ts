/** Pure figures for a list of schools. Safe for the browser. */

/** The chance of at least one admit, treating each school's odds as separate. */
export function atLeastOne(odds: number[]): number {
  return Math.round((1 - odds.reduce((miss, p) => miss * (1 - p / 100), 1)) * 100);
}

const SHORT: Record<string, string> = { "University of Pennsylvania": "Penn", "University of Chicago": "UChicago", "Johns Hopkins University": "Johns Hopkins" };

export const shortName = (name: string) => SHORT[name] ?? name.replace(/ (University|College)$/, "");
