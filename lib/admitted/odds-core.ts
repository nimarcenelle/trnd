import { createHash } from "node:crypto";

import { admitRate, earlyRate, PENDING_SCHOOLS, SCHOOLS, type School } from "./schools";

/**
 * Pure rules for odds. The number is calculated here from published figures, so similar
 * applicants get similar numbers and a stronger profile never scores lower. The model only
 * writes the wording of two fixes.
 */
export type Test = { kind: "SAT" | "ACT"; score: number } | null;
export type Profile = { gpa: number; test: Test };
export type OddsFix = { label: string; gain: number };
export type SchoolOdds = { schoolId: string; odds: number; withFixes: number; locked: number; movable: number; fixes: OddsFix[] };

/** Bump when the calculation or wording prompt changes: it replaces every saved number. */
export const ODDS_VERSION = "2";

/** Our assumptions, not published figures. Change them here and bump ODDS_VERSION. */
export const ASSUMPTIONS = {
  /** Early pools hold recruits and legacies, so only part of the gap is open to anyone. */
  earlyShare: 0.4,
  earlyMaxBoost: 3,
  /** Boost where a school does not publish early admits. */
  earlyUnpublished: { ED: 1.8, REA: 1.3, EA: 1.2 },
  noTest: 0.85,
  essayGain: 0.25,
  activitiesGain: 0.15,
};

export function parseProfile(gpa: unknown, test: unknown): Profile | null {
  const g = Number(gpa);
  if (!Number.isFinite(g) || g <= 0 || g > 5) return null;
  const raw = String(test ?? "").trim();
  if (!raw) return { gpa: Math.round(g * 100) / 100, test: null };
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n >= 400 && n <= 1600) return { gpa: Math.round(g * 100) / 100, test: { kind: "SAT", score: n } };
  if (n >= 1 && n <= 36) return { gpa: Math.round(g * 100) / 100, test: { kind: "ACT", score: n } };
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

/** Matches typed names exactly against known names, so "Brown" never lands on another school. */
export function matchSchools(text: string): { found: School[]; pending: string[]; unknown: string[] } {
  const found: School[] = [];
  const pending: string[] = [];
  const unknown: string[] = [];
  for (const part of text.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean).slice(0, 20)) {
    const n = norm(part);
    const school = SCHOOLS.find((s) => s.aliases.includes(n) || norm(s.name) === n);
    if (school) {
      if (!found.includes(school)) found.push(school);
      continue;
    }
    const later = PENDING_SCHOOLS.find((s) => s.aliases.includes(n) || norm(s.name) === n);
    if (later) pending.push(later.name);
    else unknown.push(part);
  }
  return { found, pending, unknown };
}

/** Same inputs at the same school always reach the same saved result. */
export function oddsKey(p: Profile, s: School): string {
  const test = p.test ? `${p.test.kind}${p.test.score}` : "none";
  return "odds:" + createHash("sha256").update([ODDS_VERSION, p.gpa.toFixed(2), test, s.id, s.edition].join("|")).digest("hex");
}

/** Straight lines between points, flat past both ends. */
function curve(x: number, points: [number, number][]): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

/** The 2018 ACT/SAT concordance midpoints; lower scores continue the same slope. */
const ACT_TO_SAT: Record<number, number> = { 36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370, 29: 1340, 28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180 };
export const satEquivalent = (t: NonNullable<Test>) => (t.kind === "SAT" ? t.score : (ACT_TO_SAT[t.score] ?? 1180 - 40 * (24 - t.score)));

export function testFactor(test: Test, s: School): number {
  // A school that does not use scores gives them no weight, either way.
  if (s.sat25 === null || s.sat75 === null) return 1;
  if (!test) return ASSUMPTIONS.noTest;
  const sat = satEquivalent(test);
  // Published middle 50% ranges can be narrow, and at a school admitting 40% a narrow range turns one retake
  // into a leap. A minimum width, growing with the admit rate, keeps steps small.
  const half = Math.max(100, admitRate(s) * 5) / 2;
  const mid = (s.sat25 + s.sat75) / 2;
  const low = Math.min(s.sat25, mid - half);
  const high = Math.max(s.sat75, mid + half);
  return curve(sat, [
    [low - 200, 0.15],
    [low, 0.7],
    [high, 1.5],
    [high + 100, 1.8],
  ]);
}

export const gpaFactor = (gpa: number) =>
  curve(gpa, [
    [3.0, 0.1],
    [3.5, 0.35],
    [3.7, 0.6],
    [3.9, 1],
    [4.0, 1.1],
    [4.5, 1.15],
  ]);

/** The rate outside the early round, where a school publishes enough to separate them. */
export function regularRate(s: School): number {
  const applicants = s.early?.applicants;
  const admitted = s.early?.admitted;
  return applicants && admitted ? ((s.admitted - admitted) / (s.applicants - applicants)) * 100 : admitRate(s);
}

/** How much applying early multiplies this applicant's odds. */
export function earlyBoost(s: School): number {
  if (!s.early) return 1;
  const early = earlyRate(s);
  if (early === null) return ASSUMPTIONS.earlyUnpublished[s.early.plan];
  return Math.min(ASSUMPTIONS.earlyMaxBoost, Math.max(1, (early * ASSUMPTIONS.earlyShare) / regularRate(s)));
}

/** Keeps a calculated number inside what the school's published rates can support. */
export function oddsBounds(s: School): { floor: number; cap: number } {
  const rate = admitRate(s);
  return { floor: 1, cap: Math.min(95, Math.round(Math.max(rate * 4, (earlyRate(s) ?? rate) * 1.5))) };
}

export type FixWording = { essays: string; activities: string };
export const DEFAULT_WORDING: FixWording = { essays: "Strengthen your essays", activities: "Lead with your strongest activity" };

export function calculateOdds(p: Profile, s: School, wording: FixWording = DEFAULT_WORDING): SchoolOdds {
  const { floor, cap } = oddsBounds(s);
  const exact = regularRate(s) * testFactor(p.test, s) * gpaFactor(p.gpa);
  const odds = Math.min(cap, Math.max(floor, Math.round(exact)));
  const raw: OddsFix[] = [
    ...(s.early ? [{ label: `Apply ${s.early.plan} instead of RD`, gain: exact * (earlyBoost(s) - 1) }] : []),
    { label: wording.essays, gain: exact * ASSUMPTIONS.essayGain },
    { label: wording.activities, gain: exact * ASSUMPTIONS.activitiesGain },
  ];
  const fixes: OddsFix[] = [];
  let room = cap - odds;
  for (const f of raw.sort((a, b) => b.gain - a.gain)) {
    const gain = Math.min(room, Math.max(1, Math.round(f.gain)));
    if (gain <= 0) continue;
    fixes.push({ label: f.label, gain });
    room -= gain;
  }
  const withFixes = odds + fixes.reduce((sum, f) => sum + f.gain, 0);
  const locked = Math.min(95, Math.max(5, Math.round((odds / withFixes) * 100)));
  return { schoolId: s.id, odds, withFixes, locked, movable: 100 - locked, fixes };
}
