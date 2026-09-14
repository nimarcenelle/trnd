import type { BrandPick, PickDetail, PickDismissReason, PickEvidence, PickScript, PickSignal } from "@/lib/db/types";
import { formatMetric, formatUsd, pickToText, scriptToText, type FormattedMetric } from "@/lib/picks/format";
import { gradeLabel, readGrade, type GradeSignalView, type GradeView } from "@/lib/picks/grade-view";

/**
 * The pick detail page as data: what renders, in what order, and what the
 * two feedback actions accept. Pure (no "use server", no session) so every
 * rule here is tested directly and the page only maps it to markup.
 */

/* ------------------------------ feedback input ----------------------------- */

export const DISMISS_REASONS = [
  { value: "wrong_customer", label: "Wrong customer" },
  { value: "already_tried", label: "Already tried" },
  { value: "off_brand", label: "Off-brand" },
  { value: "cant_shoot", label: "Can't shoot it" },
  { value: "other", label: "Other" },
] as const satisfies readonly { value: PickDismissReason; label: string }[];

export const NOTE_MAX_LENGTH = 500;

/** One of the five reasons, or null for anything else. */
export function parseDismissReason(raw: unknown): PickDismissReason | null {
  if (typeof raw !== "string") return null;
  const hit = DISMISS_REASONS.find((r) => r.value === raw);
  return hit ? hit.value : null;
}

/** The optional note: trimmed, capped at 500 characters, empty is null. */
export function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Cap by code point so an emoji at the boundary is never cut in half.
  const chars = Array.from(trimmed);
  return chars.length <= NOTE_MAX_LENGTH ? trimmed : chars.slice(0, NOTE_MAX_LENGTH).join("").trimEnd();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pick ids are uuids; anything else is a 404 before it reaches the database. */
export function isPickId(raw: unknown): raw is string {
  return typeof raw === "string" && UUID.test(raw);
}

/* -------------------------------- visibility ------------------------------- */

/** Drafts never render. Only a ready pick has a detail page. */
export function isRenderablePick(pick: Pick<BrandPick, "status">): boolean {
  return pick.status === "ready";
}

/** The detail, if it belongs to this business and is ready; otherwise null (a 404). */
export function viewableDetail(detail: PickDetail | null, businessId: string): PickDetail | null {
  if (!detail) return null;
  if (detail.pick.business_id !== businessId) return null;
  if (!isRenderablePick(detail.pick)) return null;
  return detail;
}

export type ActionMode = "open" | "running" | "dismissed";

/** Dismissed wins (copy and export only); a live run hides the two decisions. */
export function actionMode(detail: Pick<PickDetail, "dismissed" | "run">): ActionMode {
  if (detail.dismissed) return "dismissed";
  if (detail.run?.status === "running") return "running";
  return "open";
}

/* -------------------------------- render model ----------------------------- */

export const SIGNAL_ORDER: readonly PickSignal[] = ["customer", "culture", "competitive", "brand"];

export const SIGNAL_LABELS: Record<PickSignal, string> = {
  customer: "Customer",
  culture: "Culture",
  competitive: "Competitive",
  brand: "Brand",
};

export const MAX_CLAIMS_PER_GROUP = 2;
export const SPARKLINE_POINTS = 30;

export type DetailSection = "finding" | "bet" | "scripts" | "guardrail" | "why" | "actions";

export interface EvidenceClaim {
  id: string;
  claim: string;
  /** http(s) only; anything else renders the claim without a link. */
  href: string | null;
  sourceLabel: string | null;
}

/**
 * What a Why group's header says about its signal's score.
 * - scored: "Customer · 82 · high confidence"
 * - gap: a low-confidence signal, "Competitive · No competitors connected yet",
 *   rendered dimmer with its fix link when there is one
 * - null: the pick predates the grade, the header is the bare label
 */
export type GroupHeader =
  | { kind: "scored"; text: string; score: number; confidence: "high" | "medium" }
  | { kind: "gap"; text: string; note: string | null; cta: { label: string; href: string } | null }
  | null;

export interface EvidenceGroup {
  signal: PickSignal;
  label: string;
  header: GroupHeader;
  /** Component lines for a medium or high signal: "Volume · 74 · 40,500 searches". */
  components: { key: string; text: string }[];
  claims: EvidenceClaim[];
}

/** One line on what each signal reads, shown when the owner taps it. */
export const SIGNAL_ABOUT: Record<PickSignal, string> = {
  customer: "Who your customer is, then what that specific group is doing on social right now.",
  culture: "The whole category, wider than your own customers, to catch what is rising before it reaches them.",
  competitive: "What your direct competitors are running: what is working, what is crowded, where the gap is.",
  brand: "Your own ad history, organic traction and catalog: proof you can run this one.",
};

export interface SignalReadSignal extends GradeSignalView {
  about: string;
}

/** The four signals as the Signal read card shows them, always in order. A
 * signal the stored grade could not read is shown as a gap, never skipped. */
export interface SignalReadView {
  signals: SignalReadSignal[];
}

/** One proof under the call: a claim the brand can check, with its source. */
export interface CallProof {
  id: string;
  signal: PickSignal;
  claim: string;
  href: string | null;
  sourceLabel: string | null;
}

/** The call, first: one sentence saying what to run, and the proofs. */
export interface CallView {
  sentence: string;
  proofs: CallProof[];
}

export interface DetailView {
  sections: DetailSection[];
  /** The term, the page's title. */
  term: string;
  /** The one-sentence call and up to three proofs, shown before anything else. */
  call: CallView;
  /** 1..5 within the week. */
  rank: number;
  finding: string;
  /** "Relative demand for this term. Higher means more people searching." */
  demandExplainer: string;
  /** The chips beside the number, read from the line itself. */
  demandDeltas: DemandDelta[];
  /** The four signals for the Signal read card; null on a pick written before the grade. */
  signalRead: SignalReadView | null;
  metric: FormattedMetric & { value: string | null; sparkline: { d: string; v: number }[] };
  bet: { what: string; budget: string; duration: string; killRule: string };
  scripts: { script: PickScript; text: string }[];
  guardrail: string | null;
  /** The Opportunity Grade the pick was written with; null on older picks. */
  grade: (GradeView & { label: string }) | null;
  groups: EvidenceGroup[];
  mode: ActionMode;
  copyAll: string;
}

/** One direction chip on the demand card. */
export interface DemandDelta {
  pct: number;
  direction: "up" | "down" | "flat";
  window: "vs last week" | "over 30 days";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * What the line itself says, so the chips and the line never disagree. The
 * stored delta comes from the metric's own source, and a monthly search
 * total can read 0% while the daily index under it jumped and held. With
 * two weeks of points, "vs last week" is the last seven days against the
 * seven before; with thirty, "over 30 days" is the last seven against the
 * first seven of the window. Fewer points than that: the stored delta.
 */
export function demandDeltas(
  sparkline: { d: string; v: number }[],
  stored: { pct: number | null; window: "week" | "30d" },
): DemandDelta[] {
  const values = sparkline.map((p) => p.v).filter((v) => Number.isFinite(v));
  const chip = (ratio: number, window: DemandDelta["window"]): DemandDelta | null => {
    if (!Number.isFinite(ratio)) return null;
    const pct = Math.round((ratio - 1) * 100);
    return { pct, direction: pct > 2 ? "up" : pct < -2 ? "down" : "flat", window };
  };
  const out: DemandDelta[] = [];
  if (values.length >= 14) {
    const last = mean(values.slice(-7));
    const prev = mean(values.slice(-14, -7));
    const week = prev > 0 ? chip(last / prev, "vs last week") : last > 0 ? chip(Infinity, "vs last week") : chip(1, "vs last week");
    if (week) out.push(week.pct === Infinity ? { ...week, pct: 100 } : week);
  }
  if (values.length >= 30) {
    const last = mean(values.slice(-7));
    const first = mean(values.slice(0, 7));
    const month = first > 0 ? chip(last / first, "over 30 days") : null;
    if (month) out.push(month);
  } else if (typeof stored.pct === "number" && Number.isFinite(stored.pct)) {
    const pct = Math.round(stored.pct);
    const window = stored.window === "week" ? "vs last week" : "over 30 days";
    // The stored figure fills in only for a window the line itself could
    // not read; two chips for the same window said the same thing twice.
    if (!out.some((d) => d.window === window)) {
      out.push({ pct, direction: pct > 2 ? "up" : pct < -2 ? "down" : "flat", window });
    }
  }
  return out;
}

/** "40,500" — the metric's raw value, or null when there isn't one. */
export function formatMetricValue(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value).toLocaleString("en-US");
}

/** "5 days" / "1 day", said the way pickToText says it. */
export function formatDays(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** An http(s) link, or null. Evidence urls come from crawls and models. */
export function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function linkLabel(href: string, label: string | null): string {
  const given = label?.trim();
  if (given) return given;
  return new URL(href).hostname.replace(/^www\./, "");
}

export function groupHeader(signal: GradeSignalView | undefined): GroupHeader {
  if (!signal) return null;
  if (signal.confidence === "low" || signal.score === null) {
    return {
      kind: "gap",
      text: `${signal.label} · ${signal.note ?? "low confidence"}`,
      note: signal.note,
      cta: signal.cta,
    };
  }
  return {
    kind: "scored",
    text: `${signal.label} · ${signal.score} · ${signal.confidence} confidence`,
    score: signal.score,
    confidence: signal.confidence,
  };
}

/** "Volume · 74 · 40,500 searches this week"; a component with no data says so. */
export function componentLines(signal: GradeSignalView | undefined): { key: string; text: string }[] {
  if (!signal || signal.confidence === "low") return [];
  return signal.components.map((c) => ({
    key: c.key,
    text: [c.label, c.score === null ? "no data" : String(c.score), c.detail].filter(Boolean).join(" · "),
  }));
}

/**
 * Customer, Culture, Competitive, Brand. A group renders when it has
 * evidence, or when its signal was low confidence and carries a note: the
 * gap is surfaced, never hidden. No evidence and no note, no group.
 */
export function buildEvidenceGroups(evidence: PickDetail["evidence"], grade: GradeView | null = null): EvidenceGroup[] {
  return SIGNAL_ORDER.flatMap((signal) => {
    const claims = evidence
      .filter((e) => e.signal === signal && e.claim.trim())
      .sort((a, b) => a.position - b.position)
      .slice(0, MAX_CLAIMS_PER_GROUP)
      .map((e): EvidenceClaim => {
        const href = safeHref(e.source_url);
        return { id: e.id, claim: e.claim.trim(), href, sourceLabel: href ? linkLabel(href, e.source_label) : null };
      });
    const scored = grade?.signals.find((s) => s.name === signal);
    const header = groupHeader(scored);
    const surfacedGap = header?.kind === "gap" && header.note !== null;
    if (!claims.length && !surfacedGap) return [];
    return [{ signal, label: SIGNAL_LABELS[signal], header, components: componentLines(scored), claims }];
  });
}

/** What the metric counts, in the owner's terms. */
export function demandExplainer(label: string): string {
  const l = label.toLowerCase();
  if (/search/.test(l)) return "Relative demand for this term. Higher means more people searching.";
  if (/view|watch|tiktok|short/.test(l)) return "Relative demand for this term. Higher means more people watching.";
  if (/post|mention|talk|convers/.test(l)) return "Relative demand for this term. Higher means more people talking about it.";
  return "Relative demand for this term. Higher means more people on it.";
}

/** The Signal read: every signal in order, a gap standing in for one the
 * stored grade lacks, so the four columns are always four. */
export function buildSignalRead(grade: GradeView | null): SignalReadView | null {
  if (!grade) return null;
  return {
    signals: SIGNAL_ORDER.map((name) => {
      const found = grade.signals.find((s) => s.name === name);
      const base: GradeSignalView = found ?? {
        name,
        label: SIGNAL_LABELS[name],
        score: null,
        confidence: "low",
        note: null,
        cta: null,
        components: [],
      };
      return { ...base, about: SIGNAL_ABOUT[name] };
    }),
  };
}

/** The order proofs are shown in: the rival's live ad, then the customer's
 * words and searches, then the brand's own record, then culture. */
const PROOF_ORDER: PickSignal[] = ["competitive", "customer", "brand", "culture"];
export const CALL_PROOFS_MAX = 3;

/**
 * "Run the vitamin C serum to women 25 to 40 on TikTok and Reels this week."
 * The bet line already says what to run, who to reach and where; the call
 * puts a verb in front of it and a week behind it, and the proofs under it
 * are the strongest checkable claim per signal, rival first.
 */
export function buildCall(pick: Pick<BrandPick, "bet_what" | "term">, evidence: PickEvidence[]): CallView {
  // The bet line sometimes arrives with its own verb ("Run Instagram Reels
  // pitching..."); one verb, ours, so it never reads "Run run".
  const what = pick.bet_what
    .trim()
    .replace(/[.\s]+$/, "")
    .replace(/^(run|test|launch|try|push|ship|put up|go with)\s+/i, "");
  // Only an article or a determiner drops its capital; a platform or a
  // product name keeps it.
  const lower = /^(the|a|an|your|its|one|two|three|this|that)\b/i.test(what);
  const lead = what ? (lower ? `${what.charAt(0).toLowerCase()}${what.slice(1)}` : what) : `an ad on "${pick.term}"`;
  const sentence = /\bthis week\b/i.test(lead) ? `Run ${lead}.` : `Run ${lead} this week.`;
  const proofs: CallProof[] = [];
  for (const signal of PROOF_ORDER) {
    const best = [...evidence].filter((e) => e.signal === signal).sort((a, b) => a.position - b.position)[0];
    if (!best) continue;
    proofs.push({ id: best.id, signal, claim: best.claim, href: safeHref(best.source_url), sourceLabel: best.source_label });
    if (proofs.length >= CALL_PROOFS_MAX) break;
  }
  return { sentence, proofs };
}

export function buildDetailView(detail: PickDetail): DetailView {
  const { pick } = detail;
  const guardrail = pick.guardrail?.trim() || null;
  const grade = readGrade(pick);
  const groups = buildEvidenceGroups(detail.evidence, grade);
  const scripts = [...detail.scripts].sort((a, b) => a.position - b.position);
  const sparkline = (pick.sparkline ?? []).filter((p) => Number.isFinite(p.v)).slice(-SPARKLINE_POINTS);

  const sections: DetailSection[] = [
    "finding",
    "bet",
    "scripts",
    ...(guardrail ? (["guardrail"] as const) : []),
    ...(groups.length ? (["why"] as const) : []),
    "actions",
  ];

  return {
    sections,
    term: pick.term,
    call: buildCall(pick, detail.evidence),
    rank: pick.rank,
    finding: pick.finding,
    demandExplainer: demandExplainer(pick.metric_label),
    demandDeltas: demandDeltas(sparkline, { pct: pick.metric_delta_pct, window: pick.metric_window }),
    signalRead: buildSignalRead(grade),
    metric: { ...formatMetric(pick), value: formatMetricValue(pick.metric_value), sparkline },
    bet: {
      what: pick.bet_what,
      budget: formatUsd(Number(pick.bet_budget_usd)),
      duration: formatDays(pick.bet_duration_days),
      killRule: pick.bet_kill_rule,
    },
    scripts: scripts.map((script) => ({ script, text: scriptToText(script) })),
    guardrail,
    grade: grade ? { ...grade, label: gradeLabel(grade) } : null,
    groups,
    mode: actionMode(detail),
    copyAll: pickToText({ pick, scripts }),
  };
}

/** "trnd-pick-hard-water.txt" */
export function exportFilename(term: string): string {
  const slug = term
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `trnd-pick-${slug || "export"}.txt`;
}
