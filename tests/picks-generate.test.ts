import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-picks-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { generateWeekPicks } = await import("../lib/picks/generate");
const { fallbackConceptWrite } = await import("../lib/ai/concept-writer");
const { CONCEPT_VERSION } = await import("../lib/picks/concept");
const { weekOf } = await import("../lib/recommend/week");

const brand = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Clearwell",
  category: "Bath & shower",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "online",
  monthly_ad_spend: "20-50k",
  ad_platforms: ["meta", "tiktok"],
});

const TERMS = [
  { term: "hard water", delta: 48.6, service: "Wall Mount Filtered Showerhead" },
  { term: "shower filter", delta: 22.4, service: "Vitamin C Shower Filter" },
  { term: "dry scalp", delta: 15, service: null },
  { term: "chlorine in tap water", delta: 31, service: null },
  { term: "hair breakage", delta: -8, service: null },
];

const norm = (t: string) => t.replace(/\s+/g, "_");

async function seed(opts: { history?: boolean } = {}) {
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "owner" });
  const biz = await user.createBusiness(brand("owner"));
  const services = await user.createServices(
    [
      ["Wall Mount Filtered Showerhead", 6800],
      ["Vitamin C Shower Filter", 4500],
      ["Replacement Filter Cartridge", 2400],
    ].map(([name, price]) => ({
      business_id: biz.id,
      name: name as string,
      description: null,
      price_cents: price as number,
      is_active: true,
    })),
  );
  await admin.upsertSignals([
    ...TERMS.map((t) => ({
      source: "google_trends" as const,
      term: t.term,
      normalized_term: norm(t.term),
      category: biz.category,
      geo: "US",
      metric_type: "search_interest",
      value: 64,
      delta_pct: t.delta,
      window_days: 7,
      raw: null,
    })),
    // The short-form read on one term only: culture evidence belongs to it
    // and to no other pick. Its title carries the metric figure on purpose.
    {
      source: "tiktok" as const,
      term: "hard water",
      normalized_term: "hard_water",
      category: biz.category,
      geo: "US",
      metric_type: "shortform_views",
      value: 1_200_000,
      delta_pct: 30,
      window_days: 7,
      raw: { top: { title: "Why 49% of homes have hard water", url: "https://www.tiktok.com/@clean/video/1" }, medianDurationSec: 22 },
    },
  ]);
  const today = Date.now();
  await admin.upsertSeriesPoints(
    Array.from({ length: 35 }, (_, i) => ({
      normalized_term: "hard_water",
      geo: "US",
      day: new Date(today - (34 - i) * 86400_000).toISOString().slice(0, 10),
      value: 40 + i,
    })),
  );
  const signals = await admin.listSignalsForCategory(biz.category, { sinceDays: 1 });
  await admin.upsertOpportunities(
    TERMS.map((t, i) => ({
      business_id: biz.id,
      signal_id: signals.find((s) => s.source === "google_trends" && s.normalized_term === norm(t.term))!.id,
      week_of: weekOf(),
      score: 8 - i * 0.5,
      rationale: "Ranked this week.",
      matched_service_id: services.find((s) => s.name === t.service)?.id ?? null,
      competitor_gap: null,
      relevance: 0.8,
    })),
  );
  if (opts.history) {
    await admin.upsertAdHistory(
      [1, 2, 3].map((i) => ({
        business_id: biz.id,
        platform: "meta" as const,
        campaign_name: `Shower filter test ${i}`,
        ad_name: null,
        copy: `The shower filter that twists on in a minute, take ${i}`,
        impressions: 20000,
        clicks: 300,
        spend_cents: 60000,
        results: 15,
        ctr: null,
        started_on: "2026-08-01",
        ended_on: "2026-08-20",
        source: "meta_export" as const,
      })),
    );
  }
  return { admin, user, biz };
}

describe("the weekly pick job, keyless", () => {
  beforeEach(() => resetStore());

  it("turns five ranked opportunities into three distinct ready creative tests", async () => {
    const { admin, user, biz } = await seed();
    const result = await generateWeekPicks(admin, biz);
    expect(result).toMatchObject({ ready: 3, draft: 0, duplicates: 0 });
    expect(result.pickIds).toHaveLength(3);

    const listed = await user.listReadyPicks(biz.id, weekOf());
    expect(listed.map((l) => l.pick.term)).toEqual(TERMS.slice(0, 3).map((t) => t.term));
    expect(listed.map((l) => l.pick.rank)).toEqual([1, 2, 3]);

    const titles = new Set<string>();
    for (const { pick } of listed) {
      const detail = (await user.getPickDetail(pick.id))!;
      // The concept is whole: a title, a brief, one script, evidence with limits.
      expect(pick.concept_title).toBeTruthy();
      titles.add(pick.concept_title as string);
      expect(pick.brief_version).toBe(CONCEPT_VERSION);
      const brief = pick.brief!;
      expect(brief.hypothesis).toMatch(/^Test whether/);
      expect(brief.hooks.alternatives.length).toBeGreaterThan(0);
      expect(brief.shot_list.length).toBeGreaterThanOrEqual(2);
      expect(brief.approved_facts.length).toBeGreaterThan(0);
      expect(brief.unknowns.length).toBeGreaterThan(0);
      // Nothing on file: the plan says what is missing instead of inventing a threshold.
      expect(brief.evaluation.missing.join(" ")).toMatch(/objective/);
      expect(brief.evaluation.missing.join(" ")).toMatch(/export/);
      expect(brief.evaluation.watch.join(" ")).not.toMatch(/\d\s?%\s+after/);
      expect(pick.basis).toBe("explores");
      expect(detail.scripts).toHaveLength(1);
      expect(detail.scripts[0].hook).toBe(brief.hooks.primary);
      expect(detail.evidence.length).toBeGreaterThan(0);
      for (const e of detail.evidence) {
        expect(e.kind).toBeTruthy();
        expect(e.limitation).toBeTruthy();
      }
      // The finding column carries the hypothesis, never the metric figure.
      expect(pick.finding).toBe(brief.hypothesis);
      expect(pick.finding).not.toMatch(/\d\s?%/);
      expect(pick.metric_window).toBe("week");
      const figure = `${Math.abs(Math.round(pick.metric_delta_pct!))}%`;
      for (const e of detail.evidence) expect(e.claim).not.toContain(figure);
    }
    // Three concepts, three ideas.
    expect(titles.size).toBe(3);

    const hard = listed[0].pick;
    expect(hard.metric_label).toBe('Searches for "hard water"');
    expect(hard.metric_delta_pct).toBe(48.6);
    expect(hard.sparkline).toHaveLength(30);
    // The winning short-form length sets the script length.
    expect(hard.brief!.script.duration_seconds).toBe(22);
  });

  it("writes evidence only for the signals that have facts, each with its kind and its limit", async () => {
    const { admin, user, biz } = await seed();
    await generateWeekPicks(admin, biz);
    const listed = await user.listReadyPicks(biz.id, weekOf());
    const bySignal = async (id: string) => new Set((await user.getPickDetail(id))!.evidence.map((e) => e.signal));

    const hard = await user.getPickDetail(listed[0].pick.id);
    expect([...(await bySignal(listed[0].pick.id))].sort()).toEqual(["culture", "customer"]);
    const culture = hard!.evidence.find((e) => e.signal === "culture")!;
    expect(culture.source_url).toBe("https://www.tiktok.com/@clean/video/1");
    expect(culture.kind).toBe("observation");
    expect(culture.limitation).toMatch(/not what your customers buy/);
    const search = hard!.evidence.find((e) => e.signal === "customer")!;
    expect(search.kind).toBe("measurement");
    expect(search.limitation).toMatch(/does not show how a paid-social ad/);

    for (const { pick } of listed.slice(1)) {
      expect([...(await bySignal(pick.id))]).toEqual(["customer"]);
    }
    for (const { pick } of listed) {
      for (const e of (await user.getPickDetail(pick.id))!.evidence) expect(e.claim).not.toMatch(/no data|not measured|unknown/i);
    }
  });

  it("drops a concept that says what an earlier one said, and shows fewer", async () => {
    const { admin, user, biz } = await seed();
    // Every draft is the same idea: the week keeps one, not five.
    const result = await generateWeekPicks(admin, biz, {
      writer: async (input) => fallbackConceptWrite({ ...input, otherConcepts: [] }),
    });
    expect(result.ready).toBe(1);
    expect(result.duplicates).toBeGreaterThanOrEqual(2);
    expect(await user.listReadyPicks(biz.id, weekOf())).toHaveLength(1);
  });

  it("stores a concept whose writer output fails validation as a draft the list never shows", async () => {
    const { admin, user, biz } = await seed();
    const result = await generateWeekPicks(admin, biz, {
      writer: async (input) =>
        input.term === "dry scalp"
          ? { title: "dry scalp", hypothesis: "Up 15% this week, guaranteed.", hooks: { primary: "x", alternatives: [] } }
          : fallbackConceptWrite(input),
    });
    expect(result).toMatchObject({ ready: 3, draft: 1 });

    const listed = await user.listReadyPicks(biz.id, weekOf());
    expect(listed.map((l) => l.pick.term)).not.toContain("dry scalp");
    expect(listed).toHaveLength(3);

    const draftId = result.pickIds[result.bundles.findIndex((b) => b.pick.term === "dry scalp")];
    const draft = (await user.getPickDetail(draftId))!;
    expect(draft.pick.status).toBe("draft");
  });

  it("builds the evaluation plan from the account's own results and brings in its ad history", async () => {
    const { admin, user, biz } = await seed({ history: true });
    await generateWeekPicks(admin, biz);
    const listed = await user.listReadyPicks(biz.id, weekOf());
    const plan = listed[0].pick.brief!.evaluation;
    expect(plan.watch[0]).toContain("$40");
    expect(plan.watch[0]).toContain("Aug 1, 2026 to Aug 20, 2026");
    expect(plan.comparison).toContain("Shower filter test");
    expect(plan.missing.join(" ")).not.toMatch(/export/);
    expect(plan.caveats.join(" ")).toMatch(/directional/);
    const filter = listed.find((l) => l.pick.term === "shower filter")!;
    const brandRows = (await user.getPickDetail(filter.pick.id))!.evidence.filter((e) => e.signal === "brand");
    expect(brandRows.map((e) => e.claim)).toEqual(["Your 3 past ads on this ran about even with your account average."]);
    expect(brandRows[0].kind).toBe("measurement");
    expect(filter.pick.basis).toBe("builds_on");
    const hard = listed.find((l) => l.pick.term === "hard water")!;
    expect((await user.getPickDetail(hard.pick.id))!.evidence.some((e) => e.signal === "brand")).toBe(false);
  });

  it("skips ungraded leftovers once the week has graded rows", async () => {
    const { admin, biz } = await seed();
    const rows = await admin.listOpportunities(biz.id, weekOf());
    const last = rows[rows.length - 1];
    await admin.upsertOpportunities([
      { ...last, grade: "B", grade_score: 66, signal_scores: {} } as unknown as (typeof rows)[number],
    ]);
    const result = await generateWeekPicks(admin, biz, { write: false, writer: async (input) => fallbackConceptWrite(input) });
    expect(result.bundles.map((b) => b.pick.opportunity_id)).toEqual([last.id]);
  });

  it("leaves the week alone when there is nothing ranked", async () => {
    const { admin, biz } = await seed();
    const result = await generateWeekPicks(admin, biz, { weekOf: "2020-01-06" });
    expect(result).toEqual({ ready: 0, draft: 0, duplicates: 0, pickIds: [], bundles: [] });
  });
});
