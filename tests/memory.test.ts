import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-memory-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { buildBusinessHistory } = await import("../lib/recommend/history");
const { buildPickFacts } = await import("../lib/recommend/pick-facts");
const { previousWeek, weekOf } = await import("../lib/recommend/week");
const { answerStandingQuestions, suggestStandingQuestions, MAX_STANDING_QUESTIONS } = await import("../lib/intel/standing");
const { buildIntelReport } = await import("../lib/report/build");
const { reportFacts } = await import("../lib/report/note");
const { renderWeeklyReportEmail } = await import("../lib/email/weekly-report");

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

async function seedThreeWeeks() {
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "owner" });
  const biz = await user.createBusiness(bizInput("owner"));
  const [facial] = await user.createServices([
    { business_id: biz.id, name: "Glass skin facial", description: null, price_cents: 14000, is_active: true },
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
  ]);
  const [signal] = await admin.listSignalsForCategory(biz.category, { sinceDays: 1 });
  const w0 = weekOf();
  const w1 = previousWeek(w0);
  const w2 = previousWeek(w1);
  const rows = await admin.upsertOpportunities(
    [
      [w2, 6.4],
      [w1, 7.0],
      [w0, 7.4],
    ].map(([week, score]) => ({
      business_id: biz.id,
      signal_id: signal.id,
      week_of: String(week),
      score: Number(score),
      rationale: "Rising; matches Glass skin facial.",
      matched_service_id: facial.id,
      competitor_gap: null,
      relevance: 0.9,
    })),
  );
  return { admin, user, biz, signal, rows, w0, w1, w2 };
}

describe("what TRND remembers", () => {
  beforeEach(() => resetStore());

  it("folds weeks of rankings, a pass, and a result into one line per term", async () => {
    const { user, biz, rows, w1 } = await seedThreeWeeks();
    // Passed on it last week; an ad on this week's row returned results.
    const lastWeek = rows.find((r) => r.week_of === w1)!;
    await user.setOpportunityStatus(lastWeek.id, "dismissed");
    const thisWeek = rows.find((r) => r.week_of === weekOf())!;
    const campaign = await user.createCampaign(
      {
        opportunity_id: thisWeek.id,
        business_id: biz.id,
        angle: "a",
        hook: "Three things nobody tells you.",
        offer: "Glass skin facial — $140",
        audience: { who: "w", age_range: "25-45", radius_miles: 12, interests: [], why: "y" },
        channel: "meta",
        model_used: "test",
        prompt_version: "t",
      },
      [],
    );
    await user.setCampaignStatus(campaign.id, "live");
    await user.insertCampaignResult({
      campaign_id: campaign.id,
      impressions: 12400,
      clicks: 310,
      spend_cents: 18000,
      bookings: 9,
      revenue_cents: 124000,
      ctr: 0.025,
      cpa_cents: 2000,
      source: "manual",
    });

    const h = await buildBusinessHistory(user, biz);
    expect(h.weeksRanked).toBe(3);
    const line = h.byTerm.get("korean_glass_skin_facial")!;
    expect(line).toContain('"Korean Glass Skin Facial": ranked 2 of the last 3 weeks');
    expect(line).toContain("you passed on it last week");
    expect(line).toContain("returned 2.50% clicks, 9 bookings on $180");
    expect(h.lines[0]).toMatch(/^Memory: 3 weeks of rankings on file, 1 ad written, 1 launched, 1 result recorded\./);

    // …and the pick's facts, the report's facts, and the Monday note all carry it.
    const facts = await buildPickFacts(user, biz, thisWeek);
    expect(facts!.text).toContain("Where this pick has been: \"Korean Glass Skin Facial\": ranked 2 of the last 3 weeks");
    const report = await buildIntelReport(user, biz);
    expect(report.history.length).toBeGreaterThan(0);
    expect(reportFacts(report)).toContain("Remembered: \"Korean Glass Skin Facial\"");
  });

  it("says so in week one instead of inventing a past", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(bizInput("owner"));
    const h = await buildBusinessHistory(user, biz);
    expect(h.weeksRanked).toBe(0);
    expect(h.lines).toEqual([]);
    expect(admin).toBeTruthy();
  });
});

describe("standing questions", () => {
  beforeEach(() => resetStore());

  it("suggests openers in the owner's words that name their business", async () => {
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(bizInput("owner"));
    const services = await user.createServices([
      { business_id: biz.id, name: "Glass skin facial", description: null, price_cents: 14000, is_active: true },
    ]);
    const s = suggestStandingQuestions(biz, services, null);
    expect(s).toContain("Who is advertising against me this week, and on what?");
    expect(s).toContain("Is my Glass skin facial priced right for Atlanta right now?");
    expect(s.length).toBeLessThanOrEqual(3);
    // Already-asked ones are not re-suggested.
    const q = await user.createStandingQuestion({ business_id: biz.id, question: "Who is advertising against me this week, and on what?" });
    expect(suggestStandingQuestions(biz, services, null, [q])).not.toContain(q.question);
    expect(MAX_STANDING_QUESTIONS).toBeGreaterThanOrEqual(3);
  });

  it("wait unanswered without a model, stay private, and render into the Monday mail once answered", async () => {
    const user = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await user.createBusiness(bizInput("owner"));
    const q = await user.createStandingQuestion({ business_id: biz.id, question: "Who is advertising against me this week?" });
    expect((await answerStandingQuestions(user, biz))[0].answer).toEqual([]);

    const stranger = createDemoRepo({ kind: "user", userId: "someone-else" });
    expect(await stranger.listStandingQuestions(biz.id)).toEqual([]);
    await expect(stranger.setStandingQuestionActive(q.id, false)).rejects.toThrow(/ownership/);

    const answered = await user.answerStandingQuestion(q.id, {
      answer: ["Two rivals are on it: Bike Bros with 7 ads and Glow Bar with 2."],
      changed: "Bike Bros added 5 ads since last week.",
      answered_week: weekOf(),
      previous_answer: ["One rival was on it."],
      model_used: "test",
    });
    const report = await buildIntelReport(user, biz);
    const html = renderWeeklyReportEmail({
      business: biz,
      note: { id: "n", business_id: biz.id, week_of: report.week, headline: "Run it.", narrative: ["Because."], actions: ["Do it."], model_used: "t", prompt_version: "t", created_at: "" },
      report,
      alerts: [],
      standing: [answered],
    });
    expect(html).toContain("Your standing questions");
    expect(html).toContain("Bike Bros added 5 ads since last week.");

    await user.setStandingQuestionActive(q.id, false);
    expect(await user.listStandingQuestions(biz.id, { activeOnly: true })).toEqual([]);
  });
});
