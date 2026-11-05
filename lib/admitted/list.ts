/** Pure figures for a list of schools. Safe for the browser. */

const SHORT: Record<string, string> = { "University of Pennsylvania": "Penn", "University of Chicago": "UChicago", "Johns Hopkins University": "Johns Hopkins", "University of California, Los Angeles": "UCLA", "University of Michigan": "Michigan", "University of Wisconsin–Madison": "Wisconsin", "University of Georgia": "Georgia" };

export const shortName = (name: string) => SHORT[name] ?? name.replace(/ (University|College)$/, "");
