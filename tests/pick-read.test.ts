import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-pick-read-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { buildPickFacts } = await import("../lib/recommend/pick-facts");
const { ensurePickRead, readIsCurrent, readVersionFor } = await import("../lib/recommend/read");
const { buildCampaignForOpportunity } = await import("../lib/campaigns/build");
const { weekOf } = await import("../lib/recommend/recommend");

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Glow Room",
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 12,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: [],
});

async function seedWeek() {
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "owner" });
  const biz = await user.createBusiness(bizInput("owner"));
  const [facial, brows] = await user.createServices([
    { business_id: biz.id, name: "Glass skin facial", description: null, price_cents: 14000, is_active: true },
    { business_id: biz.id, name: "Brow lamination", description: null, price_cents: 8500, is_active: true },
  ]);
  await admin.upsertSignals([
    {
      source: "seed",
      term: "korean glass skin facial",
      normalized_term: "korean_glass_skin_facial",
      category: biz.category,
      geo: "US",
      metric_type: "conversation",
      value: 73,
      delta_pct: 47,
      window_days: 7,
      raw: null,
    },
    {
      source: "seed",
      term: "brow lamination",
      normalized_term: "brow_lamination",
      category: biz.category,
      geo: "US",
      metric_type: "conversation",
      value: 40,
      delta_pct: 12,
      window_days: 7,
      raw: null,
    },
  ]);
  const signals = await admin.listSignalsForCategory(biz.category, { sinceDays: 1 });
  const glass = signals.find((s) => s.normalized_term === "korean_glass_skin_facial")!;
  const brow = signals.find((s) => s.normalized_term === "brow_lamination")!;
  const [top, runnerUp] = await admin.upsertOpportunities([
    {
      business_id: biz.id,
      signal_id: glass.id,
      week_of: weekOf(),
      score: 7.4,
      rationale: "Rising fast; matches Glass skin facial. Snapshot read: squarely what this studio sells.",
      matched_service_id: facial.id,
      competitor_gap: "2 competing ads locally",
      relevance: 0.9,
    },
    {
      business_id: biz.id,
      signal_id: brow.id,
      week_of: weekOf(),
      score: 5.8,
      rationale: "Steady; matches Brow lamination.",
      matched_service_id: brows.id,
      competitor_gap: null,
      relevance: 0.8,
    },
  ]);
  return { admin, user, biz, top, runnerUp, glass, facial, brows };
}

describe("pick facts", () => {
  beforeEach(() => resetStore());

  it("serializes the pick from the numbers the hero shows, and asks this owner's questions", async () => {
    const { user, biz, top } = await seedWeek();
    const facts = await buildPickFacts(user, biz, top);
    expect(facts).not.toBeNull();
    expect(facts!.rank).toBe(1);
    expect(facts!.text).toContain('Pick #1 of 2 ranked this week: "Korean glass skin facial"');
    // 7.4 on the 0-10 column is 74 on the four-signal bands: a B+.
    expect(facts!.text).toContain("grade B+");
    expect(facts!.text).toContain("Matched menu item: Glass skin facial at $140");
    expect(facts!.text).toContain("Other menu items: Brow lamination ($85)");
    expect(facts!.text).toContain('The other picks this week: #2 "Brow lamination" grade C');
    expect(facts!.text).toContain("Score meters (0-100)");
    // Whether an ad exists is deliberately not in the facts: it flips a few
    // seconds after the read is written and used to rewrite every read twice.
    expect(facts!.text).not.toMatch(/campaign (is already )?built/i);
    // Every opener names something on this page — none fits another pick.
    expect(facts!.questions).toContain('Why this over "Brow lamination"?');
    expect(facts!.questions.some((q) => q.includes("Brow lamination instead"))).toBe(true);
    expect(facts!.questions.length).toBeLessThanOrEqual(3);
  });

  it("moves the fingerprint when the facts move, and holds it when they don't", async () => {
    const { admin, user, biz, top, glass, facial } = await seedWeek();
    const a = await buildPickFacts(user, biz, top);
    const b = await buildPickFacts(user, biz, top);
    expect(a!.fingerprint).toBe(b!.fingerprint);
    await admin.upsertOpportunities([
      {
        business_id: biz.id,
        signal_id: glass.id,
        week_of: weekOf(),
        score: 6.1,
        rationale: "Cooling off.",
        matched_service_id: facial.id,
        competitor_gap: "2 competing ads locally",
        relevance: 0.9,
      },
    ]);
    const c = await buildPickFacts(user, biz, (await user.getOpportunity(top.id))!);
    expect(c!.fingerprint).not.toBe(a!.fingerprint);
  });
});

describe("the read on a pick", () => {
  beforeEach(() => resetStore());

  it("is never written without a model — the insight lines stand alone", async () => {
    const { user, biz, top } = await seedWeek();
    expect(await ensurePickRead(user, biz, top)).toBeNull();
    expect(await user.getPickRead(top.id)).toBeNull();
  });

  it("is current only when written from these facts and this prompt", async () => {
    const { user, biz, top } = await seedWeek();
    const facts = (await buildPickFacts(user, biz, top))!;
    const read = await user.upsertPickRead({
      opportunity_id: top.id,
      business_id: biz.id,
      paragraphs: ["Run it. Searches are up 47% and it is your $140 facial by name.", "Two rivals are on it — plenty of room."],
      questions: ["Is $25 a day enough?", "Why this over brows?"],
      model_used: "test",
      prompt_version: readVersionFor(facts),
    });
    expect(readIsCurrent(read, facts)).toBe(true);
    const stale = { ...read, prompt_version: "read-0/old" };
    expect(readIsCurrent(stale, facts)).toBe(false);
    expect(readIsCurrent(null, facts)).toBe(false);
  });

  it("is private to the business that owns the pick", async () => {
    const { user, biz, top } = await seedWeek();
    const facts = (await buildPickFacts(user, biz, top))!;
    await user.upsertPickRead({
      opportunity_id: top.id,
      business_id: biz.id,
      paragraphs: ["Run it small — the read is thin but the fit is exact.", "Nobody nearby is advertising it this week."],
      questions: ["How small is small?", "What do I say about it?"],
      model_used: "test",
      prompt_version: readVersionFor(facts),
    });
    const stranger = createDemoRepo({ kind: "user", userId: "someone-else" });
    expect(await stranger.getPickRead(top.id)).toBeNull();
    await expect(
      stranger.upsertPickRead({
        opportunity_id: top.id,
        business_id: biz.id,
        paragraphs: ["hijacked paragraph one, long enough to pass the schema", "hijacked paragraph two, long enough to pass the schema"],
        questions: ["a hijacked question?", "another hijacked one?"],
        model_used: "test",
        prompt_version: "x",
      }),
    ).rejects.toThrow(/ownership/);
  });
});

describe("building to a direction", () => {
  beforeEach(() => resetStore());

  it("rewrites an unlaunched campaign in place — same id, fresh creatives — and refuses once launched", async () => {
    const { user, top } = await seedWeek();
    const first = await buildCampaignForOpportunity(user, top.id);
    expect("campaignId" in first).toBe(true);
    const id = (first as { campaignId: string }).campaignId;
    const before = await user.listCreatives(id);
    expect(before.length).toBeGreaterThan(0);

    // A second plain build is idempotent.
    expect(await buildCampaignForOpportunity(user, top.id)).toEqual({ campaignId: id });

    // A rebuild keeps the id and replaces the creative set wholesale.
    const again = await buildCampaignForOpportunity(user, top.id, () => {}, {
      rebuild: true,
      direction: "Lead with the brow lamination at $85 for first-time clients.",
    });
    expect(again).toEqual({ campaignId: id });
    const after = await user.listCreatives(id);
    expect(after.length).toBe(before.length);
    expect(new Set(after.map((c) => c.id)).size).toBe(after.length);
    expect(after.every((c) => !before.some((b) => b.id === c.id))).toBe(true);
    expect((await user.listCampaigns((await user.getCampaign(id))!.business_id)).length).toBe(1);

    // Launched campaigns are the record results point at — never rewritten.
    await user.setCampaignStatus(id, "live");
    const refused = await buildCampaignForOpportunity(user, top.id, () => {}, { rebuild: true, direction: "Try something else entirely." });
    expect("error" in refused && /already launched/.test(refused.error)).toBe(true);
    expect((await user.listCreatives(id)).map((c) => c.id)).toEqual(after.map((c) => c.id));
  });
});
