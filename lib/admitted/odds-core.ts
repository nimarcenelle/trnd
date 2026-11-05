import { createHash } from "node:crypto";

import { admitRate, earlyRate, PENDING_SCHOOLS, SCHOOLS, type School } from "./schools";

/** Pure rules for odds: input, the saved-result key and the limits on a model's number. */
export type Test = { kind: "SAT" | "ACT"; score: number } | null;
export type Profile = { gpa: number; test: Test };
export type OddsFix = { label: string; gain: number };
export type SchoolOdds = { schoolId: string; odds: number; withFixes: number; locked: number; movable: number; fixes: OddsFix[] };

/** Bump only when the prompt's meaning changes: it invalidates every saved number. */
export const ODDS_VERSION = "1";

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

/** Holds a model's number to a range the school's published rates can support. */
export function oddsBounds(s: School): { floor: number; cap: number } {
  const rate = admitRate(s);
  const early = earlyRate(s) ?? rate;
  return { floor: Math.max(1, Math.round(rate * 0.4)), cap: Math.min(95, Math.round(Math.max(rate * 4, early * 1.5))) };
}

export function tidyOdds(s: School, raw: { odds: number; locked: number; fixes: OddsFix[] }): SchoolOdds {
  const { floor, cap } = oddsBounds(s);
  const odds = Math.min(cap, Math.max(floor, Math.round(raw.odds)));
  const fixes: OddsFix[] = [];
  let room = cap - odds;
  for (const f of [...raw.fixes].sort((a, b) => b.gain - a.gain).slice(0, 4)) {
    const gain = Math.min(room, Math.max(0, Math.round(f.gain)));
    if (gain <= 0) continue;
    fixes.push({ label: f.label.trim(), gain });
    room -= gain;
  }
  const locked = Math.min(95, Math.max(5, Math.round(raw.locked)));
  return { schoolId: s.id, odds, withFixes: odds + fixes.reduce((sum, f) => sum + f.gain, 0), locked, movable: 100 - locked, fixes };
}

/** -1, 0 or 1 when one profile is clearly weaker, equal or stronger; null when it is mixed. */
export function compareProfiles(next: Profile, prior: Profile): -1 | 0 | 1 | null {
  if ((next.test?.kind ?? null) !== (prior.test?.kind ?? null)) return null;
  const g = Math.sign(next.gpa - prior.gpa);
  const t = Math.sign((next.test?.score ?? 0) - (prior.test?.score ?? 0));
  if (g === 0 && t === 0) return 0;
  if (g >= 0 && t >= 0) return 1;
  if (g <= 0 && t <= 0) return -1;
  return null;
}

/** A stronger profile never shows lower odds than the weaker one it replaced, or the reverse. */
export function keepDirection(next: SchoolOdds, prior: SchoolOdds, direction: -1 | 0 | 1 | null): SchoolOdds {
  const wrongWay = (direction === 1 && next.odds < prior.odds) || (direction === -1 && next.odds > prior.odds);
  if (!wrongWay) return next;
  return { ...next, odds: prior.odds, withFixes: prior.odds + next.fixes.reduce((sum, f) => sum + f.gain, 0) };
}
