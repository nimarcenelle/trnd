import type { BrandPick } from "@/lib/db/types";
import {
  GRADE_BANDS,
  SIGNAL_LABELS,
  SIGNAL_ORDER,
  gradeForScore,
  type Confidence,
  type GradeLetter,
  type SignalName,
} from "@/lib/scoring/model";

/**
 * The Opportunity Grade a pick was written with, read back for the screens.
 *
 * `signal_scores` is jsonb written by the ranking job, and older picks carry
 * null (or the column default, `{}`). Nothing here trusts its shape: a
 * malformed field drops that one piece, a malformed grade drops the grade,
 * and nothing throws. Pure, so every rule is tested directly.
 */

export interface GradeComponentView {
  key: string;
  label: string;
  /** 0-100, or null when the component had no data. */
  score: number | null;
  detail: string | null;
}

export interface GradeSignalView {
  name: SignalName;
  label: string;
  /** 0-100, rounded. Null for a low-confidence signal: its stored number is a
   * placeholder that never counted, so it never renders. */
  score: number | null;
  confidence: Confidence;
  /** Owner-facing gap, e.g. "No competitors connected yet". */
  note: string | null;
  cta: { label: string; href: string } | null;
  components: GradeComponentView[];
}

export interface GradeView {
  letter: GradeLetter;
  meaning: string;
  /** 0-100, rounded; null when only the letter was stored. */
  score: number | null;
  /** Always Customer, Culture, Competitive, Brand; a malformed signal is left out. */
  signals: GradeSignalView[];
  /** "Competitive wasn't factored in: no competitors connected yet." */
  excludedNotes: string[];
}

type GradeFields = Partial<Pick<BrandPick, "grade" | "grade_score" | "signal_scores">>;

const CONFIDENCES: readonly Confidence[] = ["high", "medium", "low"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A finite number, accepting the numeric strings Postgres `numeric` can arrive as. */
function finite(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function score100(v: unknown): number | null {
  const n = finite(v);
  return n === null ? null : Math.round(Math.min(100, Math.max(0, n)));
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** An in-app path ("/app/settings") or an http(s) url; anything else is dropped. */
function safeCtaHref(v: unknown): string | null {
  const raw = text(v);
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function readCta(v: unknown): GradeSignalView["cta"] {
  if (!isRecord(v)) return null;
  const label = text(v.label);
  const href = safeCtaHref(v.href);
  return label && href ? { label, href } : null;
}

function readComponents(v: unknown): GradeComponentView[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c, i): GradeComponentView[] => {
    if (!isRecord(c)) return [];
    const label = text(c.label);
    if (!label) return [];
    return [{ key: text(c.key) ?? `c${i}`, label, score: score100(c.score), detail: text(c.detail) }];
  });
}

function readSignal(name: SignalName, v: unknown): GradeSignalView | null {
  if (!isRecord(v)) return null;
  const confidence = CONFIDENCES.find((c) => c === v.confidence);
  if (!confidence) return null;
  const score = confidence === "low" ? null : score100(v.score);
  // A medium or high signal without a number is not a reading.
  if (confidence !== "low" && score === null) return null;
  return {
    name,
    label: SIGNAL_LABELS[name],
    score,
    confidence,
    note: text(v.note),
    cta: readCta(v.cta),
    components: readComponents(v.components),
  };
}

/** The stored letter when it is a real band, else the band its score falls in. */
function readLetter(grade: unknown, score: number | null): { letter: GradeLetter; meaning: string } | null {
  const band = GRADE_BANDS.find((b) => b.letter === grade);
  if (band) return { letter: band.letter, meaning: band.meaning };
  if (score === null) return null;
  const g = gradeForScore(score);
  return { letter: g.letter, meaning: g.meaning };
}

function readExcludedNotes(blob: Record<string, unknown>, signals: GradeSignalView[]): string[] {
  if (Array.isArray(blob.notes)) {
    return blob.notes.flatMap((n) => (text(n) ? [text(n) as string] : []));
  }
  // No notes stored: say the same thing combineSignals would have said.
  const excluded: unknown[] = Array.isArray(blob.excluded) ? blob.excluded : [];
  return SIGNAL_ORDER.filter((name) => excluded.includes(name)).map((name) => {
    const why = signals.find((s) => s.name === name)?.note?.replace(/\.$/, "");
    return `${SIGNAL_LABELS[name]} wasn't factored in${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ""}.`;
  });
}

export function readGrade(pick: GradeFields | null | undefined): GradeView | null {
  if (!pick) return null;
  const score = score100(pick.grade_score);
  const letter = readLetter(pick.grade, score);
  if (!letter) return null;

  const raw = isRecord(pick.signal_scores) ? pick.signal_scores : {};
  // The scores sit by name at the top level; an OpportunityGrade stored whole
  // nests them under `signals`. Read either.
  const bySignal = isRecord(raw.signals) ? raw.signals : raw;
  const signals = SIGNAL_ORDER.flatMap((name) => {
    const s = readSignal(name, bySignal[name]);
    return s ? [s] : [];
  });

  return { ...letter, score, signals, excludedNotes: readExcludedNotes(raw, signals) };
}

/** "A · Strong, clear go" */
export function gradeLabel(grade: Pick<GradeView, "letter" | "meaning">): string {
  return `${grade.letter} · ${grade.meaning}`;
}

export type GradeTone = "mint" | "amber" | "faint";

/** A and above read as a go, B-band as worth a look, C and Hold as quiet. */
export function gradeTone(letter: GradeLetter): GradeTone {
  if (letter === "A+" || letter === "A") return "mint";
  if (letter === "B+" || letter === "B") return "amber";
  return "faint";
}
