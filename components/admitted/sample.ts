/**
 * The sample applicants the landing page shows, on real lists. Odds, points and fix wording are the real
 * /api/odds results for these inputs, and school figures come from each school's own Common Data Set.
 * Only the round carries points on the page. What an essay or a letter is worth depends on what's in it,
 * so no number goes on one before anyone has read it.
 */
/** `round` is the early-round gain in points, or null where the school has no early round. */
export type SampleRow = { name: string; odds: number; withFixes: number; round: number | null; locked: number; movable: number; fix: { kind: string; label: string; gain: number } };

export const APPLICANTS: { key: string; gpa: string; test: string; home: string | null; place: string; schools: SampleRow[] }[] = [
  {
    key: "state",
    gpa: "3.7",
    test: "SAT 1350",
    home: "GA",
    place: "Georgia",
    schools: [
      { name: "University of Georgia", odds: 30, withFixes: 47, round: 6, locked: 64, movable: 36, fix: { kind: "essays", label: "Make your Georgia essays more personal", gain: 7 } },
      { name: "University of Wisconsin–Madison", odds: 18, withFixes: 29, round: 4, locked: 62, movable: 38, fix: { kind: "essays", label: "Make your Wisconsin essays more distinctive", gain: 4 } },
      { name: "University of Michigan", odds: 6, withFixes: 10, round: 1, locked: 60, movable: 40, fix: { kind: "essays", label: "Sharpen your Michigan essays with reflection", gain: 2 } },
      { name: "University of California, Los Angeles", odds: 6, withFixes: 8, round: null, locked: 75, movable: 25, fix: { kind: "essays", label: "Make your UCLA essays vivid and personal", gain: 1 } },
    ],
  },
  {
    key: "reach",
    gpa: "4.0",
    test: "SAT 1560",
    home: null,
    place: "",
    schools: [
      { name: "Cornell University", odds: 10, withFixes: 16, round: 1, locked: 63, movable: 37, fix: { kind: "essays", label: "Sharpen your Cornell essays with personal detail", gain: 3 } },
      { name: "Harvard University", odds: 7, withFixes: 12, round: 2, locked: 58, movable: 42, fix: { kind: "essays", label: "Make your Harvard essays thoughtful and specific", gain: 2 } },
      { name: "Yale University", odds: 7, withFixes: 12, round: 2, locked: 58, movable: 42, fix: { kind: "essays", label: "Make your Yale essays more reflective", gain: 2 } },
    ],
  },
];

/** What sets one school's number, for the hero and the split card. Only the round has a `gain`, in odds points. */
export const FACTORS = {
  school: "University of Georgia",
  short: "Georgia",
  odds: 30,
  withFixes: 47,
  upTo: 36,
  locked: ["SAT 1350 against a middle 50% of 1250–1420", "GPA 3.7, as reported", "Georgia resident"],
  movable: [
    { kind: "round", label: "Apply EA instead of RD", gain: 6 },
    { kind: "essays", label: "Your essays" },
    { kind: "letters", label: "Your recommendation letters" },
    { kind: "activities", label: "How your activities read" },
  ],
};

/** One school's published figures, with the Common Data Set section each comes from. */
export const SOURCES = {
  school: "University of Georgia",
  short: "Georgia",
  edition: "Common Data Set 2025–26",
  rows: [
    { label: "First-year applicants", value: "47,464", section: "C1" },
    { label: "Admit rate, in-state", value: "42.1%", section: "C1" },
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
};
