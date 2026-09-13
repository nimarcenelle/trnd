import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-grade-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { recommendForBusiness, weekOf } = await import("../lib/recommend/recommend");
const { generateWeekPicks } = await import("../lib/picks/generate");
const { fallbackPickWrite } = await import("../lib/ai/pick-writer");
const { gatherSignalInputs, loadGradeContext } = await import("../lib/scoring/gather");
const { DOESNT_FIT_NOTE, gradeOpportunity } = await import("../lib/scoring/grade-opportunity");
const { NOTHING_READ_NOTE } = await import("../lib/scoring/competitive");
const { buildBusinessFitContext, judgeTermRelevance } = await import("../lib/recommend/relevance");

const smokehouse = (ownerId: string, over: Partial<NewBusiness> = {}): NewBusiness => ({
  owner_id: ownerId,
  name: "Hickory Pit",
  category: "Restaurants & cafés",
  city: "Durham",
  region: "NC",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 10,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: ["meta"],
  ...over,
});

const DAY = 86400_000;

async function seed(opts: { history?: boolean; mismatch?: boolean; fit?: boolean } = {}) {
  const { history = true, mismatch = true, fit = true } = opts;
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "owner" });
  const biz = await user.createBusiness(smokehouse("owner"));
  const services = await user.createServices(
    [
      ["Smoked brisket plate", 1800],
      ["Pulled pork sandwich", 1200],
      ["Rib platter", 2400],
    ].map(([name, price]) => ({ business_id: biz.id, name: name as string, description: null, price_cents: price as number, is_active: true })),
  );
  await admin.upsertSignals([
    ...(fit
      ? [
          {
            source: "seed" as const,
            term: "smoked brisket",
            normalized_term: "smoked_brisket",
            category: biz.category,
            geo: "US",
            metric_type: "search_volume",
            value: 5400,
            delta_pct: 30,
            window_days: 7,
            raw: null,
          },
          // What customers type around it: the Customer signal's activity.
          {
            source: "google_suggest" as const,
            term: "smoked brisket",
            normalized_term: "smoked_brisket",
            category: biz.category,
            geo: "US",
            metric_type: "autocomplete",
            value: null,
            delta_pct: null,
            window_days: 7,
            raw: { suggestions: ["smoked brisket near me", "best smoked brisket", "smoked brisket price per pound"] },
          },
        ]
      : []),
    ...(mismatch
      ? [
          // Loud, rising, and nothing a smokehouse sells.
          {
            source: "tiktok" as const,
            term: "espresso martini",
            normalized_term: "espresso_martini",
            category: biz.category,
            geo: "US",
            metric_type: "conversation",
            value: 90_000,
            delta_pct: 100,
            window_days: 7,
            raw: null,
          },
        ]
      : []),
  ]);
  if (fit) {
    await admin.upsertSeriesPoints(
      Array.from({ length: 35 }, (_, i) => ({
        normalized_term: "smoked_brisket",
        geo: "US",
        day: new Date(Date.now() - (34 - i) * DAY).toISOString().slice(0, 10),
        value: 40 + i,
      })),
    );
  }
  if (history) {
    await admin.upsertAdHistory(
      [
        ...[1, 2, 3].map((i) => ({ name: `Smoked brisket weekend ${i}`, clicks: 500 })),
        ...[1, 2, 3].map((i) => ({ name: `Happy hour wings ${i}`, clicks: 200 })),
      ].map((a) => ({
        business_id: biz.id,
        platform: "meta" as const,
        campaign_name: a.name,
        ad_name: null,
        copy: null,
        impressions: 20_000,
        clicks: a.clicks,
        spend_cents: 40_000,
        results: 10,
        ctr: null,
        started_on: "2026-07-01",
        ended_on: "2026-07-20",
        source: "meta_export" as const,
      })),
    );
  }
  const signals = await admin.listSignalsForCategory(biz.category, { sinceDays: 1 });
  return { admin, user, biz, services, signals };
}

describe("the Opportunity Grade, gathered from the repo", () => {
  beforeEach(() => resetStore());

  it("grades a brand with no competitors on the other three signals, and says so", async () => {
    const { user, biz, signals } = await seed({ mismatch: false });
    const brisket = signals.find((s) => s.source === "seed")!;
    const ctx = await loadGradeContext(user, biz);
    const { grade, readings } = await gradeOpportunity(user, biz, brisket, ctx, { fit: 0.9 });

    expect(grade.signals.competitive.confidence).toBe("low");
    expect(grade.signals.competitive.cta?.href).toBe("/app/settings");
    expect(grade.excluded).toEqual(["competitive"]);
    expect(grade.weightsUsed.competitive).toBe(0);
    // 35/25/20 renormalized over 80.
    expect(grade.weightsUsed).toMatchObject({ customer: 43.8, brand: 31.3, culture: 25 });
    expect(grade.notes).toEqual(["Competitive wasn't factored in: no competitors connected yet."]);
    for (const s of ["customer", "culture", "brand"] as const) expect(grade.signals[s].confidence).not.toBe("low");
    expect(grade.hold).toBe(false);

    // Brand read its own past ads on the term: 2.5% CTR against a 1.75% account.
    expect(readings.find((r) => r.signal === "brand")?.reading.lift).toBeCloseTo(1.429, 3);
    expect(readings.find((r) => r.signal === "customer")?.reading).toMatchObject({ level_search_volume: 5400 });
  });

  it("holds a term outside the catalog whatever its other signals say", async () => {
    const { user, biz, signals } = await seed({ mismatch: false });
    const brisket = signals.find((s) => s.source === "seed")!;
    const ctx = await loadGradeContext(user, biz);
    const { grade } = await gradeOpportunity(user, biz, brisket, ctx, { fit: 0.2 });
    expect(grade.grade).toBe("Hold");
    expect(grade.hold).toBe(true);
    expect(grade.score).toBeLessThan(50);
    expect(grade.notes[0]).toBe(DOESNT_FIT_NOTE);
  });

  it("never stores a Hold in the week's five, and never writes one as a pick", async () => {
    const { admin, user, biz, services } = await seed();
    // The precondition the gate rests on: the deterministic judge puts the
    // cocktail outside a smokehouse.
    const fitCtx = buildBusinessFitContext(biz, services, null);
    expect(judgeTermRelevance("espresso martini", biz.category, fitCtx).relevance).toBeLessThan(0.4);

    const result = await recommendForBusiness(user, biz);
    const stored = await user.listOpportunities(biz.id, weekOf());
    const terms = await Promise.all(stored.map(async (o) => (await admin.getSignal(o.signal_id))!.term));
    expect(terms).toEqual(["smoked brisket"]);
    expect(result.created).toBe(1);

    const [top] = stored;
    expect(top.grade).not.toBe("Hold");
    expect(top.grade_score).toBeGreaterThanOrEqual(50);
    expect(Number(top.score)).toBeCloseTo(Number(top.grade_score) / 10, 5);
    expect(top.signal_scores).toMatchObject({ excluded: ["competitive"], notes: expect.any(Array) });
    expect((top.signal_scores as { customer: { signal: string } }).customer.signal).toBe("customer");

    // A Hold row written some other way still never becomes a pick.
    const martini = (await admin.listSignalsForCategory(biz.category, { sinceDays: 1 })).find((s) => s.term === "espresso martini")!;
    await admin.upsertOpportunities([
      {
        business_id: biz.id,
        signal_id: martini.id,
        week_of: weekOf(),
        score: 9.9,
        rationale: "Written by hand.",
        matched_service_id: null,
        competitor_gap: null,
        relevance: 0.2,
        grade: "Hold",
        grade_score: 49,
        signal_scores: {},
      },
    ]);
    const picks = await generateWeekPicks(admin, biz, { write: false, writer: async (input) => fallbackPickWrite(input) });
    expect(picks.bundles.map((b) => b.pick.term)).toEqual(["smoked brisket"]);
    expect(picks.bundles[0].pick).toMatchObject({ grade: top.grade, grade_score: Number(top.grade_score) });
  });

  it("clears rows that fell out of the ranking, so a stale term never keeps a seat", async () => {
    const { admin, user, biz } = await seed();
    const martini = (await admin.listSignalsForCategory(biz.category, { sinceDays: 1 })).find((s) => s.term === "espresso martini")!;
    // Yesterday's ranking left this row, ungraded, with a legacy score that
    // would put it first.
    await admin.upsertOpportunities([
      {
        business_id: biz.id,
        signal_id: martini.id,
        week_of: weekOf(),
        score: 9.9,
        rationale: "Ranked yesterday.",
        matched_service_id: null,
        competitor_gap: null,
        relevance: 0.9,
      },
    ]);
    await recommendForBusiness(user, biz);
    const stored = await user.listOpportunities(biz.id, weekOf());
    const terms = await Promise.all(stored.map(async (o) => (await admin.getSignal(o.signal_id))!.term));
    expect(terms).toEqual(["smoked brisket"]);
  });

  it("stores nothing when every candidate holds", async () => {
    const { user, biz } = await seed({ fit: false, history: false });
    const result = await recommendForBusiness(user, biz);
    expect(result).toMatchObject({ created: 0, topScore: null, opportunityIds: [] });
    expect(await user.listOpportunities(biz.id, weekOf())).toEqual([]);
  });

  it("writes readings on a ranking run and reads them back as the next run's baseline", async () => {
    const { user, biz } = await seed();
    await recommendForBusiness(user, biz);

    const kept = await user.listSignalReadings(biz.id, { sinceDays: 90 });
    const customer = kept.find((r) => r.signal === "customer" && r.term === "smoked_brisket");
    expect(customer?.reading.level_search_volume).toBe(5400);
    expect(kept.find((r) => r.signal === "brand" && r.term === "smoked_brisket")?.reading.lift).toBeCloseTo(1.429, 3);
    // Graded but held terms still feed the baseline.
    expect(kept.some((r) => r.signal === "customer" && r.term === "espresso_martini")).toBe(true);

    const signal = (await user.listSignalsForCategory(biz.category, { sinceDays: 1 })).find((s) => s.source === "seed")!;
    // Today's run is not its own baseline...
    const sameDay = await gatherSignalInputs(user, biz, signal, await loadGradeContext(user, biz));
    expect(sameDay.customer.levelBaseline).toEqual([]);
    // ...and tomorrow's run ranks against it.
    const tomorrow = await gatherSignalInputs(user, biz, signal, await loadGradeContext(user, biz, { now: new Date(Date.now() + DAY) }));
    expect(tomorrow.customer.levelBaseline).toEqual([5400]);
    expect(tomorrow.brand.liftBaseline).toContain(1.429);
  });
});

describe("what counts as a rival read", () => {
  beforeEach(() => resetStore());

  async function withRival(reads: { kind: "ads" | "google_ads"; raw: Record<string, unknown> }[]) {
    const { admin, user, biz, signals } = await seed({ mismatch: false });
    const rival = await user.createCompetitor({
      business_id: biz.id,
      name: "Smoke Ring",
      website: "https://smokering.example",
      place_id: null,
      social_handles: {},
      directness: 0.8,
      directness_reason: "Sells the same brisket",
    });
    await admin.upsertCompetitorReads(
      reads.map((r) => ({ competitor_id: rival.id, business_id: biz.id, kind: r.kind, value: 0, rating: null, summary: "", raw: r.raw })),
    );
    const brisket = signals.find((s) => s.source === "seed")!;
    const ctx = await loadGradeContext(user, biz);
    return gradeOpportunity(user, biz, brisket, ctx, { fit: 0.9 });
  }

  it("does not count an empty ad read as reading the rival", async () => {
    const { grade } = await withRival([{ kind: "ads", raw: { ads: [] } }]);
    expect(grade.signals.competitive.confidence).toBe("low");
    expect(grade.signals.competitive.note).toBe(NOTHING_READ_NOTE);
    expect(grade.excluded).toContain("competitive");
  });

  it("counts a Google Transparency read with real ads, and reads their running days", async () => {
    const { grade } = await withRival([
      {
        kind: "google_ads",
        raw: { sample: [{ snippet: "Smoked brisket by the pound, shipped", firstShown: "2026-08-01", lastShown: "2026-09-10", format: "text" }] },
      },
    ]);
    expect(grade.signals.competitive.confidence).toBe("medium");
    const whitespace = grade.signals.competitive.components.find((c) => c.key === "whitespace");
    expect(whitespace?.detail).toBe("1 of 1 competitor already run this angle");
  });
});
