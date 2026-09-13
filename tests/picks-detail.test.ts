import { describe, expect, it } from "vitest";

import type { BrandPick, PickDetail, PickEvidence, PickScript } from "../lib/db/types";
import {
  actionMode,
  buildDetailView,
  cleanNote,
  DISMISS_REASONS,
  exportFilename,
  isPickId,
  MAX_CLAIMS_PER_GROUP,
  NOTE_MAX_LENGTH,
  parseDismissReason,
  safeHref,
  viewableDetail,
} from "../lib/picks/detail";
import { pickToText, scriptToText } from "../lib/picks/format";
import { combineSignals, signalScore } from "../lib/scoring/model";

const PICK_ID = "7f1c2a9e-3b4d-4c5e-8f60-1a2b3c4d5e6f";

const pick = (over: Partial<BrandPick> = {}): BrandPick => ({
  id: PICK_ID,
  business_id: "b1",
  opportunity_id: null,
  week_of: "2026-09-14",
  rank: 1,
  geo: "US",
  term: "hard water",
  finding: 'Your customers are searching "hard water." Your product page says "Wall Mount Filtered Showerhead."',
  metric_label: 'Searches for "hard water"',
  metric_value: 40500,
  metric_delta_pct: 48.6,
  metric_window: "week",
  sparkline: Array.from({ length: 40 }, (_, i) => ({ d: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`, v: i })),
  bet_what: "The hard-water problem-first video on Reels",
  bet_budget_usd: 1500,
  bet_duration_days: 5,
  bet_kill_rule: "Kill if cost per purchase is 30% over your account average by day 3",
  guardrail: "Don't show a competitor's bottle.",
  status: "ready",
  created_at: "2026-09-14T00:00:00Z",
  ...over,
});

const script = (position: number): PickScript => ({
  id: `s${position}`,
  pick_id: PICK_ID,
  position,
  variant_label: ["A", "B", "C"][position],
  thesis: "Problem first",
  hook: "Your shower is why your hair feels like straw",
  beats: [
    { visual: "Hand wipes white crust off a showerhead", on_screen_text: "This is on your skin", vo: "" },
    { visual: "Swap to the filter in 20 seconds", on_screen_text: "", vo: "Twist off, twist on." },
    { visual: "Hair, after", on_screen_text: "Two weeks later", vo: "" },
  ],
  cta: "Shop the filter",
  duration_seconds: 20,
});

let evidenceSeq = 0;
const ev = (signal: PickEvidence["signal"], position: number, over: Partial<PickEvidence> = {}): PickEvidence => ({
  id: `e${evidenceSeq++}`,
  pick_id: PICK_ID,
  signal,
  claim: `${signal} claim ${position}`,
  source_url: "https://trends.google.com/explore?q=hard+water",
  source_label: "Google Trends",
  position,
  ...over,
});

const detail = (over: Partial<PickDetail> = {}): PickDetail => ({
  pick: pick(),
  evidence: [ev("brand", 0), ev("customer", 1), ev("culture", 2), ev("competitive", 3)],
  scripts: [script(2), script(0), script(1)],
  run: null,
  dismissed: false,
  ...over,
});

describe("dismiss reason and note", () => {
  it("accepts exactly the five reasons", () => {
    expect(DISMISS_REASONS.map((r) => r.value)).toEqual([
      "wrong_customer",
      "already_tried",
      "off_brand",
      "cant_shoot",
      "other",
    ]);
    for (const r of DISMISS_REASONS) expect(parseDismissReason(r.value)).toBe(r.value);
    expect(parseDismissReason("too_expensive")).toBeNull();
    expect(parseDismissReason("")).toBeNull();
    expect(parseDismissReason(null)).toBeNull();
    expect(parseDismissReason(" other")).toBeNull();
  });

  it("trims the note, nulls an empty one, and caps it at 500", () => {
    expect(cleanNote("  we shot this in May  ")).toBe("we shot this in May");
    expect(cleanNote("   ")).toBeNull();
    expect(cleanNote(null)).toBeNull();
    expect(cleanNote(new File([], "x"))).toBeNull();
    const long = cleanNote("x".repeat(900));
    expect(long).toHaveLength(NOTE_MAX_LENGTH);
    // A code point at the boundary is kept whole.
    const emoji = cleanNote("a".repeat(499) + "😀😀");
    expect(Array.from(emoji ?? "")).toHaveLength(NOTE_MAX_LENGTH);
    expect(emoji?.endsWith("😀")).toBe(true);
  });

  it("only treats uuids as pick ids", () => {
    expect(isPickId(PICK_ID)).toBe(true);
    expect(isPickId("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isPickId("abc")).toBe(false);
    expect(isPickId(`${PICK_ID}'--`)).toBe(false);
    expect(isPickId(undefined)).toBe(false);
  });
});

describe("who sees a pick", () => {
  it("hides other businesses' picks and anything not ready", () => {
    expect(viewableDetail(detail(), "b1")).not.toBeNull();
    expect(viewableDetail(detail(), "b2")).toBeNull();
    expect(viewableDetail(null, "b1")).toBeNull();
    expect(viewableDetail(detail({ pick: pick({ status: "draft" }) }), "b1")).toBeNull();
    expect(viewableDetail(detail({ pick: pick({ status: "published" }) }), "b1")).toBeNull();
  });

  it("keeps a dismissed pick to copy and export, and a running one off the decision", () => {
    expect(actionMode(detail())).toBe("open");
    expect(actionMode(detail({ dismissed: true }))).toBe("dismissed");
    const run = { id: "r1", pick_id: PICK_ID, business_id: "b1", status: "running" as const, started_at: "", ended_at: null, spend_usd: null, result_note: null, meta_campaign_id: null };
    expect(actionMode(detail({ run }))).toBe("running");
    expect(actionMode(detail({ run, dismissed: true }))).toBe("dismissed");
    expect(actionMode(detail({ run: { ...run, status: "killed" } }))).toBe("open");
  });
});

describe("the detail render model", () => {
  it("orders the sections and omits the guardrail when there isn't one", () => {
    expect(buildDetailView(detail()).sections).toEqual(["finding", "bet", "scripts", "guardrail", "why", "actions"]);
    expect(buildDetailView(detail({ pick: pick({ guardrail: null }) })).sections).toEqual([
      "finding",
      "bet",
      "scripts",
      "why",
      "actions",
    ]);
    expect(buildDetailView(detail({ pick: pick({ guardrail: "   " }) })).guardrail).toBeNull();
  });

  it("drops Why entirely when no signal has evidence", () => {
    const view = buildDetailView(detail({ evidence: [] }));
    expect(view.groups).toEqual([]);
    expect(view.sections).not.toContain("why");
  });

  it("groups evidence Customer, Culture, Competitive, Brand, omits empty groups, caps two claims", () => {
    const view = buildDetailView(
      detail({
        evidence: [
          ev("brand", 9),
          ev("customer", 3),
          ev("customer", 1),
          ev("customer", 2),
          ev("competitive", 0, { claim: "  " }),
          ev("culture", 4, { source_url: null, source_label: null }),
        ],
      }),
    );
    expect(view.groups.map((g) => g.label)).toEqual(["Customer", "Culture", "Brand"]);
    const customer = view.groups[0].claims;
    expect(customer).toHaveLength(MAX_CLAIMS_PER_GROUP);
    expect(customer.map((c) => c.claim)).toEqual(["customer claim 1", "customer claim 2"]);
    expect(customer[0]).toMatchObject({ href: "https://trends.google.com/explore?q=hard+water", sourceLabel: "Google Trends" });
    expect(view.groups[1].claims[0]).toMatchObject({ href: null, sourceLabel: null });
  });

  it("links only http(s) sources and labels a bare link by its host", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
    expect(safeHref("https://www.tiktok.com/tag/hardwater")).toBe("https://www.tiktok.com/tag/hardwater");
    const view = buildDetailView(detail({ evidence: [ev("customer", 0, { source_label: null, source_url: "https://www.reddit.com/r/Hair" })] }));
    expect(view.groups[0].claims[0].sourceLabel).toBe("reddit.com");
  });

  it("formats the metric, bet and copy text through the shared formatter", () => {
    const d = detail();
    const view = buildDetailView(d);
    expect(view.metric).toMatchObject({ label: 'Searches for "hard water"', value: "40,500", delta: "+49%", window: "week over week" });
    expect(view.metric.sparkline).toHaveLength(30);
    expect(view.metric.sparkline[29].v).toBe(39);
    expect(view.bet).toEqual({
      what: "The hard-water problem-first video on Reels",
      budget: "$1.5K",
      duration: "5 days",
      killRule: "Kill if cost per purchase is 30% over your account average by day 3",
    });
    expect(buildDetailView(detail({ pick: pick({ metric_value: null }) })).metric.value).toBeNull();
    expect(view.scripts.map((s) => s.script.variant_label)).toEqual(["A", "B", "C"]);
    expect(view.scripts[0].text).toBe(scriptToText(script(0)));
    const sorted = [script(0), script(1), script(2)];
    expect(view.copyAll).toBe(pickToText({ pick: d.pick, scripts: sorted }));
  });
});

/** A pick as the ranking job writes it now: grade, score and the four signals. */
function graded(over: { brandLow?: boolean } = {}): Partial<BrandPick> {
  const g = combineSignals({
    customer: signalScore(
      "customer",
      [
        { key: "volume", label: "Volume", weight: 40, score: 82, detail: "40,500 searches this week" },
        { key: "intent", label: "Intent", weight: 35, score: null },
      ],
      "high",
    ),
    culture: signalScore("culture", [{ key: "growth", label: "Growth", weight: 40, score: 88 }], "medium"),
    competitive: signalScore("competitive", [], "low", {
      note: "No competitors connected yet",
      cta: { label: "Connect competitors", href: "/app/settings#competitors" },
    }),
    brand: over.brandLow
      ? signalScore("brand", [{ key: "similarity", label: "Similarity", weight: 40, score: 70 }], "low")
      : signalScore("brand", [{ key: "similarity", label: "Similarity", weight: 40, score: 80 }], "medium"),
  });
  const { signals, weightsUsed, excluded, notes } = g;
  return {
    grade: g.grade,
    grade_score: g.score,
    signal_scores: JSON.parse(JSON.stringify({ ...signals, weightsUsed, excluded, notes })),
  };
}

describe("the grade on the detail page", () => {
  it("has no grade, notes or header numbers on a pick written before the grade", () => {
    const view = buildDetailView(detail());
    expect(view.grade).toBeNull();
    expect(view.groups.every((g) => g.header === null && g.components.length === 0)).toBe(true);
  });

  it("puts the letter and its meaning beside the one metric, and the excluded notes under it", () => {
    const view = buildDetailView(detail({ pick: pick(graded()) }));
    expect(view.grade?.letter).toBe("A");
    expect(view.grade?.label).toBe("A · Strong, clear go");
    expect(view.grade?.excludedNotes).toEqual(["Competitive wasn't factored in: no competitors connected yet."]);
    // The metric is still said once, and the grade label never repeats it.
    expect(view.metric.text).toBe("+49% week over week");
    expect(view.grade?.label).not.toContain(view.metric.delta);
  });

  it("gives no excluded notes when every signal counted", () => {
    const g = graded();
    const blob = { ...(g.signal_scores as Record<string, unknown>), notes: [], excluded: [] };
    expect(buildDetailView(detail({ pick: pick({ ...g, signal_scores: blob }) })).grade?.excludedNotes).toEqual([]);
  });

  it("heads each group with its score and confidence, and a gap with its note and fix link", () => {
    const view = buildDetailView(detail({ pick: pick(graded()) }));
    expect(view.groups.map((g) => g.header?.text)).toEqual([
      "Customer · 82 · high confidence",
      "Culture · 88 · medium confidence",
      "Competitive · No competitors connected yet",
      "Brand · 80 · medium confidence",
    ]);
    const competitive = view.groups[2].header;
    expect(competitive).toMatchObject({ kind: "gap", cta: { label: "Connect competitors", href: "/app/settings#competitors" } });
    // The placeholder 50 never renders as a number.
    expect(competitive?.text).not.toMatch(/\d/);
  });

  it("lists components under a medium or high signal, never under a gap", () => {
    const view = buildDetailView(detail({ pick: pick(graded()) }));
    expect(view.groups[0].components.map((c) => c.text)).toEqual(["Volume · 82 · 40,500 searches this week", "Intent · no data"]);
    expect(view.groups[2].components).toEqual([]);
  });

  it("shows a low-confidence signal with a note even without evidence, and still omits one with neither", () => {
    const view = buildDetailView(detail({ pick: pick(graded({ brandLow: true })), evidence: [ev("customer", 0)] }));
    // Competitive has a note and no evidence: shown. Brand is low with no
    // note and no evidence: omitted. Culture has a score but no evidence: omitted.
    expect(view.groups.map((g) => g.label)).toEqual(["Customer", "Competitive"]);
    expect(view.groups[1].claims).toEqual([]);
    expect(view.sections).toContain("why");
  });

  it("keeps a low-confidence signal's evidence under a dim header when it has no note", () => {
    const view = buildDetailView(detail({ pick: pick(graded({ brandLow: true })) }));
    expect(view.groups[3].header).toMatchObject({ kind: "gap", text: "Brand · low confidence", note: null });
    expect(view.groups[3].claims).toHaveLength(1);
  });
});

describe("export filename", () => {
  it("slugs the term", () => {
    expect(exportFilename("hard water")).toBe("trnd-pick-hard-water.txt");
    expect(exportFilename('Crème brûlée "latte"!')).toBe("trnd-pick-creme-brulee-latte.txt");
    expect(exportFilename("///")).toBe("trnd-pick-export.txt");
    expect(exportFilename("a".repeat(100))).toBe(`trnd-pick-${"a".repeat(60)}.txt`);
  });
});
