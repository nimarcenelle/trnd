import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-picks-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { generateWeekPicks, productsToBrief, termFitsProduct, nextAngle, isTimelyTrigger, weekEnd, CONCEPTS_PER_PRODUCT } = await import("../lib/picks/generate");
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

  it("writes one concept per product on the first pass, timely where this week points at the product", async () => {
    const { admin, user, biz } = await seed();
    const result = await generateWeekPicks(admin, biz);
    expect(result).toMatchObject({ ready: 3, draft: 0, duplicates: 0, evidenceAdded: 0 });
    expect(result.pickIds).toHaveLength(3);

    const listed = await user.listReadyPicks(biz.id, weekOf());
    // The showerhead and the filter have a rising search behind them this
    // week; the cartridge has nothing pushing it and gets the ad to make for
    // it anyway. "shower filter" fits the cartridge's name too, but one
    // ranked row triggers one product.
    expect(listed.map((l) => [l.pick.term, l.pick.timing])).toEqual([
      ["hard water", "timely"],
      ["shower filter", "timely"],
      ["Replacement Filter Cartridge", "evergreen"],
    ]);
    expect(listed.map((l) => l.pick.rank)).toEqual([1, 2, 3]);
    expect(new Set(listed.map((l) => l.pick.service_id)).size).toBe(3);
    expect(listed.map((l) => l.pick.expires_on)).toEqual([weekEnd(weekOf()), weekEnd(weekOf()), null]);

    const titles = new Set<string>();
    for (const { pick } of listed) {
      const detail = (await user.getPickDetail(pick.id))!;
      // The concept is whole: a title, a brief, one script, evidence with limits.
      expect(pick.concept_title).toBeTruthy();
      titles.add(pick.concept_title as string);
      expect(pick.angle).toBeTruthy();
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
      if (pick.metric_delta_pct !== null) {
        const figure = `${Math.abs(Math.round(pick.metric_delta_pct))}%`;
        for (const e of detail.evidence) expect(e.claim).not.toContain(figure);
      }
    }
    // Three concepts, three ideas.
    expect(titles.size).toBe(3);

    const hard = listed[0].pick;
    expect(hard.metric_label).toBe('Searches for "hard water"');
    expect(hard.metric_delta_pct).toBe(48.6);
    expect(hard.metric_window).toBe("week");
    expect(hard.sparkline).toHaveLength(30);
    // The winning short-form length sets the script length.
    expect(hard.brief!.script.duration_seconds).toBe(22);

    const cartridge = listed[2].pick;
    expect(cartridge.opportunity_id).toBeNull();
    expect(cartridge.metric_delta_pct).toBeNull();
    expect(cartridge.priority_reason).toMatch(/No weekly signal is pushing Replacement Filter Cartridge/);
    const context = (await user.getPickDetail(cartridge.id))!.evidence.find((e) => e.kind === "context")!;
    expect(context.claim).toMatch(/Nothing in this week's reads is pushing Replacement Filter Cartridge/);
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

    expect([...(await bySignal(listed[1].pick.id))]).toEqual(["customer"]);
    // The evergreen concept says plainly that nothing is pushing it, and
    // carries no measurement it does not have.
    const evergreen = (await user.getPickDetail(listed[2].pick.id))!.evidence;
    expect(evergreen.map((e) => e.kind)).toContain("context");
    expect(evergreen.some((e) => e.kind === "measurement")).toBe(false);
    for (const { pick } of listed) {
      for (const e of (await user.getPickDetail(pick.id))!.evidence) expect(e.claim).not.toMatch(/no data|not measured|unknown/i);
    }
  });

  it("drops a concept that says what the product already has, and keeps what was written", async () => {
    const { admin, user, biz } = await seed();
    // A writer that ignores the angle and the product's other concepts:
    // every draft for a product is the same idea.
    const sameIdea = async (input: Parameters<typeof fallbackConceptWrite>[0]) => fallbackConceptWrite({ ...input, otherConcepts: [], angle: undefined });
    const first = await generateWeekPicks(admin, biz, { writer: sameIdea });
    expect(first).toMatchObject({ ready: 3, duplicates: 0 });
    const second = await generateWeekPicks(admin, biz, { writer: sameIdea });
    expect(second).toMatchObject({ ready: 0, draft: 0, duplicates: 3 });
    const listed = await user.listReadyPicks(biz.id, weekOf());
    expect(listed).toHaveLength(3);
    expect(listed.map((l) => l.pick.id).sort()).toEqual([...first.pickIds].sort());
  });

  it("stores a concept whose writer output fails validation as a draft the list never shows", async () => {
    const { admin, user, biz } = await seed();
    const result = await generateWeekPicks(admin, biz, {
      writer: async (input) =>
        input.term === "shower filter"
          ? { title: "shower filter", hypothesis: "Up 15% this week, guaranteed.", hooks: { primary: "x", alternatives: [] } }
          : fallbackConceptWrite(input),
    });
    expect(result).toMatchObject({ ready: 2, draft: 1 });

    const listed = await user.listReadyPicks(biz.id, weekOf());
    expect(listed.map((l) => l.pick.term)).not.toContain("shower filter");
    expect(listed).toHaveLength(2);

    const draftId = result.pickIds[result.bundles.findIndex((b) => b.pick.term === "shower filter")];
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
    const signals = await Promise.all(rows.map((o) => admin.getSignal(o.signal_id)));
    const filter = rows[signals.findIndex((s) => s?.term === "shower filter")];
    await admin.upsertOpportunities([{ ...filter, grade: "B", grade_score: 66, signal_scores: {} } as unknown as (typeof rows)[number]]);
    const result = await generateWeekPicks(admin, biz, { write: false, writer: async (input) => fallbackConceptWrite(input) });
    // Only the graded row can trigger a concept; the ungraded "hard water"
    // row does not, so the showerhead is evergreen this pass.
    expect(result.bundles.map((b) => b.pick.opportunity_id).filter(Boolean)).toEqual([filter.id]);
    expect(result.bundles.map((b) => b.pick.term)).not.toContain("hard water");
    expect(result.pickIds).toEqual([]);
  });

  it("writes the ad to make anyway for every product when nothing is ranked", async () => {
    const { admin, user, biz } = await seed();
    const result = await generateWeekPicks(admin, biz, { weekOf: "2020-01-06" });
    expect(result).toMatchObject({ ready: 3, draft: 0, duplicates: 0 });
    for (const b of result.bundles) {
      expect(b.pick.timing).toBe("evergreen");
      expect(b.pick.opportunity_id).toBeNull();
      expect(b.pick.expires_on).toBeNull();
      expect(b.pick.grade).toBeNull();
    }
    // Evergreen concepts outlive the week they were written in.
    expect(await user.listOpenPicks(biz.id, "2020-01-13")).toHaveLength(3);
  });

  it("writes nothing for a brand with no products to brief for", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(brand("owner"));
    expect(await generateWeekPicks(admin, biz)).toEqual({ ready: 0, draft: 0, duplicates: 0, evidenceAdded: 0, pickIds: [], bundles: [] });
  });
});

describe("a week that fills in over passes", () => {
  beforeEach(() => resetStore());

  it("adds under what is written and never rewrites a concept the owner has read", async () => {
    const { admin, user, biz } = await seed();
    const first = await generateWeekPicks(admin, biz, { limit: 1 });
    expect(first.pickIds).toHaveLength(1);
    const [firstId] = first.pickIds;
    const before = (await user.getPickDetail(firstId))!;

    const second = await generateWeekPicks(admin, biz);
    expect(second.ready).toBeGreaterThanOrEqual(2);
    expect(second.pickIds).not.toContain(firstId);
    const after = (await user.getPickDetail(firstId))!;
    expect(after.pick.concept_title).toBe(before.pick.concept_title);
    expect(after.pick.brief).toEqual(before.pick.brief);

    // Each product fills up to its ceiling with a different angle each time,
    // then the pass writes nothing for it.
    let passes = 0;
    while (passes++ < 6) {
      const r = await generateWeekPicks(admin, biz);
      if (r.ready + r.draft === 0) break;
    }
    const open = await user.listOpenPicks(biz.id, weekOf());
    const byProduct = new Map<string, string[]>();
    for (const o of open) byProduct.set(o.pick.service_id!, [...(byProduct.get(o.pick.service_id!) ?? []), o.pick.angle!]);
    expect(byProduct.size).toBe(3);
    for (const angles of byProduct.values()) {
      expect(angles).toHaveLength(CONCEPTS_PER_PRODUCT);
      expect(new Set(angles).size).toBe(CONCEPTS_PER_PRODUCT);
    }
    expect(open.filter((o) => o.pick.timing === "timely")).toHaveLength(2);
    expect(await user.listOpenPicks(biz.id, weekOf())).toContainEqual(expect.objectContaining({ pick: expect.objectContaining({ id: firstId }) }));
  });

  it("adds the deep read's evidence to a timely concept instead of writing it again", async () => {
    const { admin, user, biz } = await seed();
    const first = await generateWeekPicks(admin, biz, { limit: 1 });
    const [hardId] = first.pickIds;
    const rows = (await user.getPickDetail(hardId))!.evidence.length;
    // The deep read lands a comment on the term.
    await admin.upsertSocialComments([
      { business_id: biz.id, competitor_id: null, post_external_id: "p9", platform: "tiktok", external_id: "c1", author: "mara", text: "hard water wrecked my hair until I got a filter", likes: 40, posted_at: new Date().toISOString() },
    ] as never);
    const second = await generateWeekPicks(admin, biz, { mode: "fill" });
    expect(second.evidenceAdded).toBeGreaterThan(0);
    const after = (await user.getPickDetail(hardId))!;
    expect(after.evidence.length).toBeGreaterThan(rows);
    expect(after.evidence.some((e) => e.kind === "quote")).toBe(true);
    // Added once: the same read on the next pass adds nothing.
    const third = await generateWeekPicks(admin, biz, { mode: "fill" });
    expect(third.evidenceAdded).toBe(0);
    expect((await user.getPickDetail(hardId))!.evidence.length).toBe(after.evidence.length);
  });

  it("keeps evergreen and acted-on concepts through Monday's replace", async () => {
    const { admin, user, biz } = await seed();
    await generateWeekPicks(admin, biz);
    const open = await user.listOpenPicks(biz.id, weekOf());
    const timely = open.filter((o) => o.pick.timing === "timely");
    const evergreen = open.filter((o) => o.pick.timing === "evergreen");
    expect(timely).toHaveLength(2);
    expect(evergreen).toHaveLength(1);
    // The owner chose one of the timely concepts.
    await user.createPickFeedback({ pick_id: timely[0].pick.id, business_id: biz.id, user_id: "owner", action: "chosen", reason: null, note: null });

    const replaced = await generateWeekPicks(admin, biz, { mode: "replace" });
    expect(replaced.ready).toBeGreaterThan(0);
    const now = await user.listOpenPicks(biz.id, weekOf());
    const ids = new Set(now.map((o) => o.pick.id));
    expect(ids.has(evergreen[0].pick.id)).toBe(true);
    expect(ids.has(timely[0].pick.id)).toBe(true);
    expect(ids.has(timely[1].pick.id)).toBe(false);
  });
});

describe("the product model", () => {
  const svc = (id: string, name: string, price: number, active = true) => ({ id, business_id: "b", name, description: null, price_cents: price, is_active: active, created_at: "", updated_at: "" }) as never;

  it("briefs for the chosen products, the lead first, else every active one capped", () => {
    const all = [svc("a", "Alpha", 100), svc("b", "Bravo", 900), svc("c", "Charlie", 500), svc("d", "Delta", 200, false), svc("e", "Echo", 50), svc("f", "Foxtrot", 60), svc("g", "Golf", 70)];
    expect(productsToBrief({ brief_service_ids: [], priority_service_id: null }, all).map((s) => s.name)).toEqual(["Bravo", "Charlie", "Alpha", "Golf", "Foxtrot"]);
    expect(productsToBrief({ brief_service_ids: [], priority_service_id: "e" }, all).map((s) => s.name)[0]).toBe("Echo");
    expect(productsToBrief({ brief_service_ids: ["c", "a", "d"], priority_service_id: null }, all).map((s) => s.name)).toEqual(["Charlie", "Alpha"]);
  });

  it("matches a term to a product on a content word of its name", () => {
    expect(termFitsProduct("hard water shower filter", { name: "Vitamin C Shower Filter" })).toBe(true);
    expect(termFitsProduct("hard water", { name: "Wall Mount Filtered Showerhead" })).toBe(false);
    expect(termFitsProduct("smoked brisket near me", { name: "Smoked brisket plate" })).toBe(true);
    expect(termFitsProduct("the set", { name: "The Set" })).toBe(false);
  });

  it("calls a trigger timely on a real weekly move or a B-or-better grade, and rotates angles", () => {
    expect(isTimelyTrigger({ grade: "C" }, 15)).toBe(true);
    expect(isTimelyTrigger({ grade: "C" }, 14.9)).toBe(false);
    expect(isTimelyTrigger({ grade: "B" }, null)).toBe(true);
    expect(isTimelyTrigger({ grade: "B-" }, 3)).toBe(false);
    expect(nextAngle([], true)).toBe("problem_first");
    expect(nextAngle([], false)).toBe("demo");
    expect(nextAngle(["problem_first", "objection"], true)).toBe("demo");
    expect(nextAngle(["problem_first", "objection", "demo", "comparison", "social_proof", "education"], true)).toBe("problem_first");
    expect(weekEnd("2026-09-14")).toBe("2026-09-20");
  });
});
