/**
 * The sample applicant the landing page and its product shot show, on a real list. School
 * figures in SOURCES and the copy come from each school's own Common Data Set: Dartmouth,
 * Cornell, Yale and Harvard 2025–26. Odds and points are the real /api/odds results for GPA 3.95, SAT 1530.
 * Odds are percentages; locked and movable are each school's share of the number (they add to 100).
 */

export const APPLICANT = {
  label: "Sample applicant",
  gpa: "3.95",
  test: "SAT 1530",
};

export const SCHOOLS = [
  { name: "Harvard University", odds: 6, withFixes: 10, locked: 60, movable: 40, fix: { label: "Apply REA instead of RD", gain: 2 } },
  { name: "Yale University", odds: 6, withFixes: 10, locked: 60, movable: 40, fix: { label: "Apply REA instead of RD", gain: 2 } },
  { name: "Dartmouth College", odds: 5, withFixes: 14, locked: 36, movable: 64, fix: { label: "Apply ED instead of RD", gain: 7 } },
  { name: "Cornell University", odds: 8, withFixes: 12, locked: 67, movable: 33, fix: { label: "Clarify your academic motivation essays", gain: 2 } },
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

/** An invented draft, marked up the way a real review marks one. */
export const ESSAY = {
  prompt: "Common App personal statement",
  draft:
    "I have always been passionate about science. In my junior year I joined Dr. Okafor's research lab. The centrifuge ran at 4,000 rpm and kept failing, usually on Tuesdays, so I learned to hear the bearing going. Fixing it took six weeks and two wrong parts, which taught me a lot about perseverance.",
  keepLine: "so I learned to hear the bearing going.",
  fixLine: "which taught me a lot about perseverance.",
  fix: "Say what you do differently now that you can hear a failure coming.",
  problem: "This names a virtue where the reader wanted to see how you think.",
  score: 58,
  after: 67,
};
