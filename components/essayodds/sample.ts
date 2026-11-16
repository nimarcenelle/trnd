/**
 * The sample applicants the landing page shows, on real lists. Odds, points and fix wording are the real
 * /api/odds results for these inputs, and school figures come from each school's own Common Data Set.
 * Only an early round still open carries points on the page (none after this cycle's early deadlines). What an essay or a letter is worth depends on what's in it,
 * so no number goes on one before anyone has read it.
 */
/** `round` is the early-round gain in points, or null where the school has no early round. `fix` is the next move shown. */
export type SampleRow = { name: string; odds: number; withFixes: number; round: number | null; locked: number; movable: number; fix: { kind: string; label: string; gain: number } };

export const APPLICANTS: { key: string; gpa: string; test: string; home: string | null; place: string; schools: SampleRow[] }[] = [
  {
    key: "state",
    gpa: "3.7",
    test: "SAT 1350",
    home: "GA",
    place: "Georgia",
    schools: [
      { name: "University of Georgia", odds: 30, withFixes: 41, round: null, locked: 73, movable: 27, fix: { kind: "essays", label: "Make your Georgia essay specific", gain: 7 } },
      { name: "University of Wisconsin–Madison", odds: 18, withFixes: 25, round: null, locked: 72, movable: 28, fix: { kind: "essays", label: "Make your Why UW–Madison essay specific", gain: 4 } },
      { name: "University of Michigan", odds: 6, withFixes: 9, round: null, locked: 67, movable: 33, fix: { kind: "essays", label: "Make your Michigan essays personal", gain: 2 } },
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
      { name: "Cornell University", odds: 10, withFixes: 15, round: null, locked: 67, movable: 33, fix: { kind: "essays", label: "Make your Cornell college essay specific", gain: 3 } },
      { name: "Harvard University", odds: 7, withFixes: 10, round: null, locked: 70, movable: 30, fix: { kind: "essays", label: "Make your Harvard short answers specific", gain: 2 } },
      { name: "Yale University", odds: 7, withFixes: 10, round: null, locked: 70, movable: 30, fix: { kind: "essays", label: "Make your Yale essay specific", gain: 2 } },
    ],
  },
];

/** What sets one school's number, for the hero and the split card. Only the round has a `gain`, in odds points. */
export const FACTORS = {
  school: "Harvard University",
  short: "Harvard",
  /** The applicant behind these numbers: the "reach" sample above. */
  gpa: "4.0",
  test: "1560",
  odds: 7,
  withFixes: 10,
  locked: ["SAT 1560 against a middle 50% of 1450–1560", "GPA 4.0, as reported", "Same rate for every state"],
  movable: [
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
