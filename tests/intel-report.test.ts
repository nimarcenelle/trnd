import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-intel-test-"));

import { createDemoRepo } from "../lib/db/demo/repo";
import { resetStore } from "../lib/db/demo/store";
import type { NewBusiness } from "../lib/db/types";
import { buildIntelReport } from "../lib/report/build";
import { buildFallbackIntelNote, noteFingerprint, reportFacts } from "../lib/report/note";
import { weekOf } from "../lib/recommend/recommend";

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Sweathouz",
  category: "Health & beauty",
  city: "Chapel Hill",
  region: "NC",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: [],
});

const brief = (businessId: string) => ({
  business_id: businessId,
  positioning: "The private contrast-therapy answer in Chapel Hill.",
  customer_segments: ["Athletes in recovery cycles."],
  market_context: "Recovery is a growing local market.",
  pricing_read: "Mid-market for the category.",
  seasonality: "New Year peaks.",
  does_well: ["Private suites."],
  moat: "Private suites nobody else offers.",
  advantages: ["The $30 intro session."],
  watchouts: ["No medical claims."],
  first_moves: ["Run the $30 Intro Session ad."],
  watch_terms: ["cold plunge chapel hill", "infrared sauna near me"],
  lexicon: ["plunge", "sauna", "recovery"],
  subreddits: ["coldplunge"],
  model_used: "test",
  prompt_version: "brief-4",
});

async function seed() {
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "u1" });
  const biz = await user.createBusiness(bizInput("u1"));
  await user.createServices([
    { business_id: biz.id, name: "Cold Plunge Session", description: null, price_cents: 3000, is_active: true },
  ]);
  await user.upsertBusinessBrief(brief(biz.id));
  await admin.upsertSignals([
    {
      source: "snapshot",
      term: "cold plunge chapel hill",
      normalized_term: "cold_plunge_chapel_hill",
      category: biz.category,
      geo: "US-NC",
      metric_type: "steady_demand",
      value: null,
      delta_pct: null,
      window_days: 7,
      raw: {},
    },
    {
      source: "news",
      term: "cold plunge chapel hill",
      normalized_term: "cold_plunge_chapel_hill",
      category: biz.category,
      geo: "US-NC",
      metric_type: "news_coverage",
      value: 3,
      delta_pct: null,
      window_days: 7,
      raw: {},
    },
    {
      source: "meta_ads",
      term: "cold plunge chapel hill",
      normalized_term: "cold_plunge_chapel_hill",
      category: biz.category,
      geo: "US-NC",
      metric_type: "ad_saturation",
      value: 2,
      delta_pct: null,
      window_days: 7,
      raw: { ads: [{ advertiser: "Rival Recovery", snippet: "Cold plunge intro offer" }] },
    },
    {
      source: "tiktok",
      term: "skin barrier repair",
      normalized_term: "skin_barrier_repair",
      category: biz.category,
      geo: "US",
      metric_type: "conversation",
      value: null,
      delta_pct: 51,
      window_days: 7,
      raw: {},
    },
  ]);
  const signals = await admin.listSignalsForCategory(biz.category);
  const evergreen = signals.find((s) => s.source === "snapshot")!;
  await user.upsertOpportunities([
    {
      business_id: biz.id,
      signal_id: evergreen.id,
      week_of: weekOf(),
      score: 7.2,
      rationale: `"cold plunge chapel hill" is trending; you already sell Cold Plunge Session. Snapshot read: Exactly what they sell.`,
      matched_service_id: null,
      competitor_gap: "2 active Meta ads match this near you — low saturation",
      relevance: 1,
    },
  ]);
  return { user, biz };
}

describe("buildIntelReport", () => {
  beforeEach(() => resetStore());

  it("assembles ranked rows, demand tracker, competitors, and provenance from stored signals", async () => {
    const { user, biz } = await seed();
    const report = await buildIntelReport(user, biz);

    expect(report.ranked).toHaveLength(1);
    expect(report.ranked[0]).toMatchObject({
      rank: 1,
      term: "cold plunge chapel hill",
      source: "snapshot",
      snapshotReason: "Exactly what they sell.",
      // 7.2 on the 0-10 column is 72 on the four-signal bands: a B+.
      grade: expect.objectContaining({ letter: "B+" }),
    });

    const plunge = report.demand.find((d) => d.term === "cold plunge chapel hill")!;
    expect(plunge.coverageCount).toBe(3);
    expect(plunge.adCount).toBe(2);
    expect(plunge.lastRead).not.toBeNull();
    // The unwatched term reports honestly rather than estimating.
    const sauna = report.demand.find((d) => d.term === "infrared sauna near me")!;
    expect(sauna.coverageCount).toBeNull();
    expect(sauna.lastRead).toBeNull();

    expect(report.competitors[0]).toMatchObject({ adCount: 2 });
    expect(report.competitors[0].ads[0].advertiser).toBe("Rival Recovery");

    const sources = report.sourceCounts.map((s) => s.source);
    expect(sources).toEqual(expect.arrayContaining(["snapshot", "news", "meta_ads", "tiktok"]));
  });
});

describe("intel note", () => {
  beforeEach(() => resetStore());

  it("fallback note names the top pick when the week is worth running", async () => {
    const { user, biz } = await seed();
    const report = await buildIntelReport(user, biz);
    const note = buildFallbackIntelNote(biz, report);
    expect(note.headline).toContain("Cold plunge chapel hill");
    expect(note.headline).not.toContain("Hold");
    expect(note.actions.length).toBeGreaterThanOrEqual(2);
    expect(note.week_of).toBe(weekOf());
  });

  it("fallback actions are moves in the world, not chores in the app", async () => {
    const { user, biz } = await seed();
    const note = buildFallbackIntelNote(biz, await buildIntelReport(user, biz));
    const text = note.actions.join(" ");
    // The owner sees this list every week — anything the software could say
    // with no data at all ("build the campaign", "record your results") is
    // filler, and filler is what gets a report skipped.
    expect(text).not.toMatch(/record (your |the )?results|takes under a minute|check the dashboard/i);
    expect(text).toMatch(/Cold plunge chapel hill/i);
  });

  it("an online brand's fallback note makes creative calls, not counter moves", async () => {
    const { user, biz } = await seed();
    const report = await buildIntelReport(user, biz);
    const brand = { ...biz, market: "online" as const, monthly_ad_spend: "20-50k" };
    const note = buildFallbackIntelNote(brand, report);
    expect(note.headline).toContain("Cold plunge chapel hill");
    expect(note.headline).toMatch(/next ad/);
    const text = [note.headline, ...note.narrative, ...note.actions].join(" ");
    expect(text).not.toMatch(/walk-ins|counter|register|search ad|near you|mile radius/i);
    // Spend is a test share of the month, never dollars a day.
    expect(note.actions.join(" ")).toContain("$1,000 to $2,000 over one week");
    expect(note.actions.join(" ")).not.toMatch(/\/day/);
    expect(note.actions.length).toBeGreaterThanOrEqual(2);
    // Local copy is untouched for the same report.
    const local = buildFallbackIntelNote(biz, report).actions.join(" ");
    expect(local).toMatch(/Run an ad on "Cold plunge chapel hill" this week/);
    expect(local).not.toMatch(/over one week/);
  });

  it("an online brand's empty week still gets a creative call, never a wait", async () => {
    const { user, biz } = await seed();
    const empty = { ...(await buildIntelReport(user, biz)), ranked: [] };
    const note = buildFallbackIntelNote({ ...biz, market: "online" as const }, empty);
    const text = [note.headline, ...note.narrative, ...note.actions].join(" ");
    expect(text).not.toMatch(/wait|check back|enough data|mile radius|walk-ins|counter/i);
    expect(note.actions.length).toBeGreaterThanOrEqual(2);
  });

  it("an empty week still gets a move — never a wait", async () => {
    const { user, biz } = await seed();
    const full = await buildIntelReport(user, biz);
    const empty = { ...full, ranked: [] };
    const note = buildFallbackIntelNote(biz, empty);
    const text = [note.headline, ...note.narrative, ...note.actions].join(" ");
    expect(text).not.toMatch(/wait|check back|enough data|ingest|as soon as|picks up/i);
    expect(note.actions.length).toBeGreaterThanOrEqual(2);
    expect(reportFacts(empty)).toContain("Standing moves from the analysis");
    // The stored note is keyed to what it was written from: once picks land
    // the empty-week note is stale and regenerated, not shown.
    expect(noteFingerprint(empty)).not.toBe(noteFingerprint(full));
  });

  it("facts block carries the reads the model is allowed to cite", async () => {
    const { user, biz } = await seed();
    const facts = reportFacts(await buildIntelReport(user, biz));
    expect(facts).toContain("3 local news mentions");
    expect(facts).toContain("2 competing Meta ads");
    expect(facts).toContain("Rival Recovery");
    expect(facts).toContain("grade B+");
  });

  it("notes persist per business-week and stay owner-scoped", async () => {
    const { user, biz } = await seed();
    const report = await buildIntelReport(user, biz);
    const note = buildFallbackIntelNote(biz, report);
    await user.upsertIntelNote(note);
    expect((await user.getIntelNote(biz.id, report.week))?.headline).toBe(note.headline);
    const stranger = createDemoRepo({ kind: "user", userId: "u2" });
    expect(await stranger.getIntelNote(biz.id, report.week)).toBeNull();
  });
});

describe("short-form format facts", () => {
  it("pulls the format out of a deep short-form read", async () => {
    const { formatRead } = await import("../lib/report/build");
    const out = formatRead("shortform_views", {
      medianDurationSec: 18,
      engagementPct: 6.4,
      repeatChannels: ["Studio A"],
      top: { title: "the 60-second color test" },
      breakout: { title: "undertone in one take" },
    });
    expect(out).toMatchObject({
      medianDurationSec: 18,
      engagementPct: 6.4,
      topTitle: "the 60-second color test",
      breakoutTitle: "undertone in one take",
    });
    expect(out?.actionPct).toBeNull();
  });

  it("returns nothing for non-short-form sources", async () => {
    const { formatRead } = await import("../lib/report/build");
    expect(formatRead("search_interest", { sparse: true })).toBeNull();
  });

  it("returns nothing for a row stored before the deep capture landed", async () => {
    const { formatRead } = await import("../lib/report/build");
    // The old shape carried uploads and a top video only — rendering that as
    // a format would claim zero-second videos nobody engaged with.
    expect(formatRead("shortform_views", { uploads: 14, uploadsPrev: 9 })).toBeNull();
  });
});
