/**
 * The sample applicants the landing page shows, on real lists. Odds, points and fix wording are the real
 * /api/odds results for these inputs, and school figures come from each school's own Common Data Set.
 * These lists are the ones where essays lead or tie for the biggest gain. The live tool still shows
 * whatever is largest for a student's own schools, which at many early-decision schools is the round.
 */
export type SampleRow = { name: string; odds: number; withFixes: number; locked: number; movable: number; fix: { label: string; gain: number } };

export const APPLICANTS: { key: string; gpa: string; test: string; schools: SampleRow[] }[] = [
  {
    key: "state",
    gpa: "3.7",
    test: "SAT 1350",
    schools: [
      { name: "University of Georgia", odds: 24, withFixes: 39, locked: 62, movable: 38, fix: { label: "Make your Georgia essays more personal", gain: 6 } },
      { name: "University of Wisconsin–Madison", odds: 18, withFixes: 29, locked: 62, movable: 38, fix: { label: "Make your Wisconsin essays more personal", gain: 4 } },
      { name: "University of Michigan", odds: 6, withFixes: 10, locked: 60, movable: 40, fix: { label: "Make your Michigan essays more personal", gain: 2 } },
      { name: "University of California, Los Angeles", odds: 6, withFixes: 8, locked: 75, movable: 25, fix: { label: "Make your UCLA essays more personal", gain: 1 } },
    ],
  },
  {
    key: "reach",
    gpa: "4.0",
    test: "SAT 1560",
    schools: [
      { name: "Cornell University", odds: 10, withFixes: 16, locked: 63, movable: 37, fix: { label: "Make your personal essays more specific", gain: 3 } },
      { name: "Harvard University", odds: 7, withFixes: 12, locked: 58, movable: 42, fix: { label: "Make your personal essays more specific", gain: 2 } },
      { name: "Yale University", odds: 7, withFixes: 12, locked: 58, movable: 42, fix: { label: "Make your personal essays more specific", gain: 2 } },
    ],
  },
];

/** What sets one school's number, for the hero and the split card. `gain` is the odds points a fix adds. */
export const FACTORS = {
  school: "University of Georgia",
  short: "Georgia",
  odds: 24,
  withFixes: 39,
  locked: ["SAT 1350 against a middle 50% of 1250–1420", "GPA 3.7, as reported"],
  movable: [
    { label: "Make your Georgia essays more personal", gain: 6 },
    { label: "Apply EA instead of RD", gain: 5 },
    { label: "Show sustained impact through activities", gain: 4 },
  ],
};

/** One school's published figures, with the Common Data Set section each comes from. */
export const SOURCES = {
  school: "University of Georgia",
  short: "Georgia",
  edition: "Common Data Set 2025–26",
  rows: [
    { label: "First-year applicants", value: "47,464", section: "C1" },
    { label: "Admit rate, all applicants", value: "34.3%", section: "C1" },
    { label: "SAT middle 50%", value: "1250–1420", section: "C9" },
    { label: "Early action closes", value: "Oct 15", section: "C22" },
    { label: "Regular deadline", value: "Jan 1", section: "C14" },
  ],
};

/** An invented draft. The after uses only what the before says, as a real rewrite must. */
export const ESSAY = {
  prompt: "Common App personal statement",
  before: "I have always been passionate about science. In my junior year I joined Dr. Okafor's research lab, which taught me a lot about perseverance.",
  after: "The centrifuge in Dr. Okafor's lab ran at 4,000 rpm and kept failing, usually on Tuesdays. I learned to hear the bearing going.",
  gain: 6,
  where: "Georgia",
};
