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
const { fallbackPickWrite } = await import("../lib/ai/pick-writer");
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

  it("turns five ranked opportunities into five ready picks with three scripts each", async () => {
    const { admin, user, biz } = await seed();
    const result = await generateWeekPicks(admin, biz);
    expect(result).toMatchObject({ ready: 5, draft: 0 });
    expect(result.pickIds).toHaveLength(5);

    const listed = await user.listReadyPicks(biz.id, weekOf());
    expect(listed.map((l) => l.pick.term)).toEqual(TERMS.map((t) => t.term));
    expect(listed.map((l) => l.pick.rank)).toEqual([1, 2, 3, 4, 5]);

    for (const { pick } of listed) {
      const detail = (await user.getPickDetail(pick.id))!;
      expect(detail.scripts).toHaveLength(3);
      expect(new Set(detail.scripts.map((s) => s.thesis)).size).toBe(3);
      expect(detail.evidence.length).toBeGreaterThan(0);
      // The finding quotes the customer's words and not the number.
      expect(pick.finding).toContain(`"${pick.term}`);
      expect(pick.finding).not.toMatch(/\d\s?%/);
      expect(pick.metric_window).toBe("week");
      expect(pick.bet_budget_usd).toBe(1000);
      expect(pick.bet_duration_days).toBe(5);
      expect(pick.bet_kill_rule).toBe("Kill if click-through is under 1.5% after day 3");
      const figure = `${Math.abs(Math.round(pick.metric_delta_pct!))}%`;
      for (const e of detail.evidence) expect(e.claim).not.toContain(figure);
    }

    const hard = listed[0].pick;
    expect(hard.metric_label).toBe('Searches for "hard water"');
    expect(hard.metric_delta_pct).toBe(48.6);
    expect(hard.sparkline).toHaveLength(30);
    expect(hard.finding).toBe('Your customers are searching "hard water." Your product page says "Wall Mount Filtered Showerhead."');
    // The winning short-form length sets the script length.
    const hardDetail = (await user.getPickDetail(hard.id))!;
    expect(hardDetail.scripts.every((s) => s.duration_seconds === 22)).toBe(true);
  });

  it("writes evidence only for the signals that have facts", async () => {
    const { admin, user, biz } = await seed();
    await generateWeekPicks(admin, biz);
    const listed = await user.listReadyPicks(biz.id, weekOf());
    const bySignal = async (id: string) => new Set((await user.getPickDetail(id))!.evidence.map((e) => e.signal));

    const hard = await user.getPickDetail(listed[0].pick.id);
    expect([...(await bySignal(listed[0].pick.id))].sort()).toEqual(["culture", "customer"]);
    expect(hard!.evidence.find((e) => e.signal === "culture")!.source_url).toBe("https://www.tiktok.com/@clean/video/1");

    for (const { pick } of listed.slice(1)) {
      expect([...(await bySignal(pick.id))]).toEqual(["customer"]);
    }
    for (const { pick } of listed) {
      for (const e of (await user.getPickDetail(pick.id))!.evidence) expect(e.claim).not.toMatch(/no data|not measured|unknown/i);
    }
  });

  it("stores a pick whose writer output fails validation as a draft the list never shows", async () => {
    const { admin, user, biz } = await seed();
    const result = await generateWeekPicks(admin, biz, {
      writer: async (input) =>
        input.term === "dry scalp"
          ? { finding: "Up 15% this week.", bet_what: "Run something", guardrail: null, scripts: [] }
          : fallbackPickWrite(input),
    });
    expect(result).toMatchObject({ ready: 4, draft: 1 });

    const listed = await user.listReadyPicks(biz.id, weekOf());
    expect(listed.map((l) => l.pick.term)).not.toContain("dry scalp");
    expect(listed).toHaveLength(4);

    const draftId = result.pickIds[result.bundles.findIndex((b) => b.pick.term === "dry scalp")];
    const draft = (await user.getPickDetail(draftId))!;
    expect(draft.pick.status).toBe("draft");
    expect(draft.scripts).toHaveLength(0);
  });

  it("sets the kill rule from the account's own cost per purchase and brings in its ad history", async () => {
    const { admin, user, biz } = await seed({ history: true });
    await generateWeekPicks(admin, biz);
    const listed = await user.listReadyPicks(biz.id, weekOf());
    expect(listed[0].pick.bet_kill_rule).toBe(
      "Kill if cost per purchase runs 30% over your account average ($40) by day 3",
    );
    const filter = listed.find((l) => l.pick.term === "shower filter")!;
    const brandRows = (await user.getPickDetail(filter.pick.id))!.evidence.filter((e) => e.signal === "brand");
    expect(brandRows.map((e) => e.claim)).toEqual(["Your 3 past ads on this ran about even with your account average."]);
    const hard = listed.find((l) => l.pick.term === "hard water")!;
    expect((await user.getPickDetail(hard.pick.id))!.evidence.some((e) => e.signal === "brand")).toBe(false);
  });

  it("leaves the week alone when there is nothing ranked", async () => {
    const { admin, biz } = await seed();
    const result = await generateWeekPicks(admin, biz, { weekOf: "2020-01-06" });
    expect(result).toEqual({ ready: 0, draft: 0, pickIds: [], bundles: [] });
  });
});
