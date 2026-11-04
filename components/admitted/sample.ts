/**
 * The sample applicant the landing page and its product shot show. Every school is
 * invented, so no real college carries a made-up number. Odds are percentages; locked
 * and movable are each school's share of the number (they add to 100).
 */

export type Band = "Reach" | "Target" | "Likely";

export type SampleSchool = {
  name: string;
  band: Band;
  /** Admit odds today, from stats and the current application. */
  odds: number;
  /** Odds once the movable part is done. */
  withFixes: number;
  locked: number;
  movable: number;
  plan: "ED II" | "EA" | "RD" | "Rolling";
  due: string;
};

export const APPLICANT = {
  label: "Sample applicant",
  cycle: "2026–27 cycle",
  gpa: "3.82",
  test: "SAT 1480",
  locked: 64,
  movable: 36,
};

export const SCHOOLS: SampleSchool[] = [
  { name: "Hollis University", band: "Reach", odds: 11, withFixes: 15, locked: 72, movable: 28, plan: "RD", due: "Jan 2" },
  { name: "Calder College", band: "Reach", odds: 19, withFixes: 31, locked: 61, movable: 39, plan: "ED II", due: "Jan 1" },
  { name: "Wrenfield University", band: "Target", odds: 38, withFixes: 47, locked: 66, movable: 34, plan: "EA", due: "Nov 15" },
  { name: "Marrow College", band: "Target", odds: 44, withFixes: 52, locked: 63, movable: 37, plan: "RD", due: "Jan 15" },
  { name: "Ashby College", band: "Likely", odds: 72, withFixes: 79, locked: 58, movable: 42, plan: "EA", due: "Dec 1" },
  { name: "Linden State University", band: "Likely", odds: 81, withFixes: 84, locked: 64, movable: 36, plan: "Rolling", due: "Open" },
];

export type Move = { rank: number; title: string; gain: string; where: string; status: string; tone: "pos" | "warn" | "outline" };

/** The movable part, ranked by points gained. */
export const MOVES: Move[] = [
  { rank: 1, title: "Apply ED II to Calder", gain: "+8", where: "at Calder", status: "Due Jan 1", tone: "warn" },
  { rank: 2, title: "Add Ashby College, apply EA", gain: "+7", where: "on 1+ admits", status: "Ready", tone: "pos" },
  { rank: 3, title: "Rewrite “Why Wrenfield” from your draft", gain: "+6", where: "at Wrenfield", status: "Draft ready", tone: "pos" },
  { rank: 4, title: "Lead activities with the lab role", gain: "+4", where: "at Hollis", status: "To do", tone: "outline" },
];

/**
 * What sets one school's number, for the split card. `share` is each factor's part of
 * the number (locked + movable shares add to 100); `gain` is the odds points its fix adds.
 */
export const FACTORS = {
  school: "Calder College",
  odds: 19,
  withFixes: 31,
  locked: [
    { label: "GPA 3.82 vs. middle 50% 3.79–3.96", share: 34 },
    { label: "SAT 1480 vs. middle 50% 1450–1540", share: 18 },
    { label: "Course rigor, as reported", share: 9 },
  ],
  movable: [
    { label: "Round: ED II instead of RD", share: 21, gain: 8 },
    { label: "Supplement: “Why Calder”", share: 11, gain: 3 },
    { label: "Activities order and framing", share: 7, gain: 1 },
  ],
};

export const ESSAY = {
  prompt: "Common App personal statement",
  draft:
    "I have always been passionate about science. Ever since I was young, I loved figuring out how things work. In my junior year I joined a research lab, which taught me a lot about perseverance and teamwork.",
  rewrite:
    "The centrifuge in Dr. Okafor's lab ran at 4,000 rpm and failed every third Tuesday. By March I could hear the bearing go before the alarm did. Fixing it took me six weeks and two wrong parts.",
  revision: 3,
  words: "648 / 650",
  kept: 71,
};
