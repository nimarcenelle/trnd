/** Pure helpers for a list of schools. Safe for the browser. */
import { SCHOOLS } from "./schools";

const SHORT: Record<string, string> = { "University of Pennsylvania": "Penn", "University of Chicago": "UChicago", "Johns Hopkins University": "Johns Hopkins", "University of California, Los Angeles": "UCLA", "University of Michigan": "Michigan", "University of Wisconsin–Madison": "Wisconsin", "University of Georgia": "Georgia", "Georgia Institute of Technology": "Georgia Tech", "University of North Carolina at Chapel Hill": "UNC", "University of Florida": "Florida", "University of Washington, Seattle": "Washington", "New York University": "NYU", "University of Southern California": "USC", "Boston University": "BU", "Purdue University, West Lafayette": "Purdue", "University of Illinois Urbana-Champaign": "Illinois", "Ohio State University": "Ohio State", "Penn State University Park": "Penn State", "Texas A&M University": "Texas A&M", "University of Notre Dame": "Notre Dame", "University of Virginia": "UVA", "University of Texas at Austin": "UT Austin" };

export const shortName = (name: string) => SHORT[name] ?? name.replace(/ (University|College)$/, "");

/** How the picker names a school to the odds route. The route splits on commas, and one full name has a comma. */
export const schoolQuery = (name: string) => SCHOOLS.find((s) => s.name === name)?.aliases[0] ?? name;

/** "Up to" counts only the round, which comes from published rates. Essays and letters can't be sized unread. */
export const upTo = (odds: number, fixes: { kind: string; gain: number }[]): number | null => {
  const round = fixes.find((f) => f.kind === "round");
  return round ? odds + round.gain : null;
};
