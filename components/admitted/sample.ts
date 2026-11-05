/**
 * The sample applicant the landing page and its product shot show, on a real list. School
 * figures in SOURCES and the copy come from each school's own Common Data Set: Dartmouth,
 * Cornell, Yale and Harvard 2025–26. Odds and points are the real /api/odds results for GPA 3.95, SAT 1530.
 * Odds are percentages; locked and movable are each school's share of the number (they add to 100).
 */

export type Band = "High reach" | "Reach";

export type SampleSchool = {
  name: string;
  band: Band;
  /** Admit odds today, from stats and the current application. */
  odds: number;
  /** Odds once the movable part is done. */
  withFixes: number;
  locked: number;
  movable: number;
  plan: "ED" | "RD";
  due: string;
};

export const APPLICANT = {
  label: "Sample applicant",
  cycle: "2027–28 cycle",
  gpa: "3.95",
  test: "SAT 1530",
  locked: 56,
  movable: 44,
};

export const SCHOOLS: SampleSchool[] = [
  { name: "Harvard University", band: "High reach", odds: 6, withFixes: 10, locked: 60, movable: 40, plan: "RD", due: "Jan 1" },
  { name: "Yale University", band: "High reach", odds: 6, withFixes: 10, locked: 60, movable: 40, plan: "RD", due: "Jan 2" },
  { name: "Dartmouth College", band: "Reach", odds: 5, withFixes: 14, locked: 36, movable: 64, plan: "ED", due: "Nov 1" },
  { name: "Cornell University", band: "Reach", odds: 8, withFixes: 12, locked: 67, movable: 33, plan: "RD", due: "Jan 2" },
];

export type Move = { rank: number; title: string; gain: string; where: string; status: string; tone: "pos" | "warn" | "outline" };

/** The movable part, ranked by points gained. */
export const MOVES: Move[] = [
  { rank: 1, title: "Apply ED to Dartmouth", gain: "+7", where: "at Dartmouth", status: "Due Nov 1", tone: "warn" },
  { rank: 2, title: "Add Cornell, apply RD", gain: "+7", where: "on 1+ admits", status: "Ready", tone: "pos" },
  { rank: 3, title: "Make your community essays more personal", gain: "+1", where: "at Dartmouth", status: "Draft ready", tone: "pos" },
  { rank: 4, title: "Highlight initiative beyond titles", gain: "+1", where: "at Yale", status: "To do", tone: "outline" },
];

/**
 * What sets one school's number, for the split card. `share` is each factor's part of
 * the number (locked + movable shares add to 100); `gain` is the odds points its fix adds.
 */
export const FACTORS = {
  school: "Dartmouth College",
  odds: 5,
  withFixes: 14,
  locked: [
    { label: "SAT 1530 vs. middle 50% 1440–1550", share: 18 },
    { label: "GPA 3.95, as reported", share: 12 },
    { label: "Course rigor, as reported", share: 6 },
  ],
  movable: [
    { label: "Round: ED instead of RD", share: 50, gain: 7 },
    { label: "Make your community essays more personal", share: 7, gain: 1 },
    { label: "Emphasize collaboration and contribution", share: 7, gain: 1 },
  ],
};

/** One school's published figures, with the Common Data Set section each comes from. */
export const SOURCES = {
  school: "Dartmouth College",
  edition: "Common Data Set 2025–26",
  rows: [
    { label: "First-year applicants", value: "28,230", section: "C1" },
    { label: "Admit rate, all applicants", value: "6.0%", section: "C1" },
    { label: "Admit rate, early decision", value: "21.6%", section: "C21" },
    { label: "SAT middle 50%", value: "1440–1550", section: "C9" },
    { label: "Regular deadline", value: "Jan 3", section: "C14" },
  ],
};

export const ESSAY = {
  prompt: "Common App personal statement",
  draft:
    "I have always been passionate about science. In my junior year I joined Dr. Okafor's research lab. The centrifuge ran at 4,000 rpm and kept failing, usually on Tuesdays, so I learned to hear the bearing going. Fixing it took six weeks and two wrong parts, which taught me a lot about perseverance.",
  rewrite:
    "The centrifuge in Dr. Okafor's lab ran at 4,000 rpm and failed every third Tuesday. By March I could hear the bearing go before the alarm did. Fixing it took me six weeks and two wrong parts.",
  revision: 3,
  words: "648 / 650",
  kept: 71,
};
