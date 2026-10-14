import { describe, expect, it, vi } from "vitest";

const opp = {
  type: "counter",
  title: "",
  competitors: ["Rival"],
  signal: "s",
  intent: "i",
  fit: "f",
  urgency: "high",
  confidence: "medium",
  recommendation: "r",
  brief: { angle: "", hook: "", offer: "", creative: "", format: "", audience: "", experiment: "" },
  evidence: [] as string[],
};

vi.mock("@/lib/ai/openai", () => ({
  generateJson: vi.fn(async () => ({
    headline: "h",
    summary: "s",
    insights: [{ title: "t", detail: "d", status: "new", evidence: ["A1", "MADE-UP", "S1", "E1", "E9"] }],
    opportunities: [
      { ...opp, type: "ignore", title: "skip it", scores: { relevance: 5, urgency: 5, differentiation: 5, feasibility: 5, confidence: 5 } },
      { ...opp, title: "low", evidence: ["NOPE", "A1"], scores: { relevance: 2, urgency: 2, differentiation: 2, feasibility: 2, confidence: 2 } },
      { ...opp, title: "high", evidence: ["[S1]"], scores: { relevance: 5, urgency: 4, differentiation: 4, feasibility: 4, confidence: 3 } },
    ],
    rivals: [],
    landscape: { summary: "s", positions: [], you_vs_them: { only_you: [], only_them: [], open_lanes: [] } },
  })),
}));

import { reportPrompt, writeReport } from "@/lib/ai/analyze";
import type { Ad } from "@/lib/db/types";

const ad = (over: Partial<Ad>): Ad => ({
  id: "x",
  brand_id: "b",
  rival_id: "r",
  archive_id: "A1",
  page_name: "Rival",
  body: "Stop washing your hair in chlorine.",
  title: null,
  cta: "Shop now",
  link_url: null,
  format: "video",
  image_url: null,
  video_url: null,
  platforms: [],
  variants: 4,
  started_at: "2026-08-01",
  active: true,
  first_seen_at: "",
  last_seen_at: "",
  stopped_at: null,
  angle: "problem/solution",
  hook: null,
  offer: "15% off",
  ...over,
});

const input = {
  brand: { name: "Mine", url: "https://mine.com", summary: "Shower filters.", category: "shower filters" },
  rivals: [{ name: "Rival", ads: [ad({}), ad({ archive_id: "A2", started_at: "2026-10-10" })] }],
  changes: null,
  today: "2026-10-12",
};

describe("report", () => {
  it("lists ads longest-running first, with the evidence the model may cite", () => {
    const prompt = reportPrompt(input);
    expect(prompt.indexOf("[A1] · 72d running · scaling")).toBeGreaterThan(-1);
    expect(prompt).toContain("[A2] · 2d running · testing");
    expect(prompt.indexOf("[A1]")).toBeLessThan(prompt.indexOf("[A2]"));
    expect(prompt).toContain("4 variants");
    expect(prompt).toContain("offer: 15% off");
    expect(prompt).not.toContain("What changed");
  });

  it("puts the brand's own ads, profile and social beside its rivals'", () => {
    const prompt = reportPrompt({
      ...input,
      brand: {
        ...input.brand,
        profile: { what_it_sells: "Shower filters", price_point: "$79", price_tier: "mid", audience: "Women 25-45", value_props: ["Softer hair"], proof_points: [], offers: ["Free refill"], tone: "Warm", differentiators: ["Vitamin C"] },
      },
      own: [ad({ archive_id: "OWN1", rival_id: "self", started_at: "2026-10-01" })],
      social: [{ name: "Rival", profile: { platform: "instagram", handle: "rival", followers: 12000, posts_per_week: 3, engagement_rate: 0.021, recent: [] }, growth: { from: 11000, to: 12000, days: 30 } }],
    });
    expect(prompt).toContain("Mine's own active Meta ads (1)");
    expect(prompt).toContain("[OWN1]");
    expect(prompt).toContain("Price: $79 (mid)");
    expect(prompt).toContain("@rival): 12000 followers, +1000 followers in 30d, 3 posts/week, engagement 2.10%");
    expect(prompt).toContain("landscape:");
    expect(prompt).toContain("opportunities:");
    expect(prompt).toContain("win_choice");
  });

  it("judges against the brand's goals and its own past results", () => {
    const prompt = reportPrompt({
      ...input,
      brand: { ...input.brand, objectives: { goal: "subscriptions", monthly_budget: "$15k", target_cost: "$35", focus: "refills", notes: "" } },
      results: [
        { ad_name: "UGC hair", body: "My hair stopped breaking", spend: 4000, ctr: 1.9, results: 200, result_type: "purchases", cost_per_result: 20, roas: 3.1 },
        { ad_name: "Sale 20%", body: null, spend: 3000, ctr: 0.8, results: 50, result_type: "purchases", cost_per_result: 60, roas: 0.9 },
      ],
    });
    expect(prompt).toContain("Right now the brand wants to grow subscriptions. Focus: refills. Monthly ad budget: $15k. Target cost per result: $35.");
    expect(prompt).toContain(`"UGC hair" ("My hair stopped breaking"): spent 4000, 200 purchases at 20 each, CTR 1.9%, ROAS 3.1`);
  });

  it("leads with the conversion ranking, topics and hooks, and asks for one plain headline", () => {
    const scored = [90, 75, 60, 30].map((score, i) => ad({ id: `s${i}`, archive_id: `S${i}`, score, topic: i < 2 ? "hard water" : "price", hook: `hook ${i}` }));
    const prompt = reportPrompt({ ...input, rivals: [{ name: "Rival", ads: scored }] });
    expect(prompt).toContain("# Conversion ranking");
    expect(prompt).toContain("- 90 · Rival · [S0] · topic: hard water · hook: \"hook 0\"");
    expect(prompt).toContain("- hard water: 2 ads, average score 83");
    expect(prompt.indexOf("# Conversion ranking")).toBeLessThan(prompt.indexOf("# Active Meta ads"));
    expect(prompt).toContain("ONE story");
    expect(reportPrompt(input)).not.toContain("# Conversion ranking");
    const withOwn = reportPrompt({ ...input, rivals: [{ name: "Rival", ads: scored }], own: [ad({ id: "own", archive_id: "OWN", rival_id: "self", score: 70, topic: "price" })] });
    expect(withOwn).toContain("# Where Mine stands on the conversion score");
    expect(withOwn).toContain("- #1 Mine (you): 70");
    expect(withOwn).toContain("- #2 Rival: 64");
    expect(withOwn).toContain("Mine's best ad ranks #3 of 5 ads");
    expect(withOwn).toContain("hard water (83, you don't)");
  });

  it("never reports an unread company as running no ads", () => {
    const prompt = reportPrompt({ ...input, ownUnread: "we couldn't find its Facebook Page", rivals: [...input.rivals, { name: "Ghost", ads: [], unread: "the read failed: login wall" }] });
    expect(prompt).toContain("Mine's own Meta ads: NOT READ (we couldn't find its Facebook Page)");
    expect(prompt).not.toContain("none running");
    expect(prompt).toContain("## Ghost: ads NOT READ (the read failed: login wall)");
  });

  it("reads website changes and emails as signals, marking what is new", () => {
    const prompt = reportPrompt({
      ...input,
      site: [{ id: "sc1", brand_id: "b", rival_id: "r", kind: "price_down", title: "Price down: Filter", before: "$79", after: "$59", url: null, detected_at: "2026-10-11T00:00:00Z", rival: "Rival", fresh: true }],
      emails: [{ id: "em1", subject: "Bundle & save 30%", preview: "Two filters", received_at: "2026-10-10T00:00:00Z", kind: "promo", offer: "30% off bundle", theme: "bundles", is_repeat: false, rival: "Rival", fresh: false }],
    });
    expect(prompt).toContain("[S1] 2026-10-11 · Rival · Price down: Filter ($79 → $59) · NEW");
    expect(prompt).toContain('[E1] 2026-10-10 · Rival · promo · offer: 30% off bundle · theme: bundles · new push · "Bundle & save 30%"');
    expect(prompt).toContain("connecting signals");
  });

  it("maps refs to stored ids, drops made-up ones, and ranks opportunities with ignore last", async () => {
    const body = await writeReport({
      ...input,
      site: [{ id: "sc1", brand_id: "b", rival_id: "r", kind: "price_down", title: "t", before: null, after: null, url: null, detected_at: "2026-10-11T00:00:00Z", rival: "Rival", fresh: true }],
      emails: [{ id: "em1", subject: "s", preview: null, received_at: "2026-10-10T00:00:00Z", kind: null, offer: null, theme: null, is_repeat: null, rival: "Rival", fresh: true }],
    });
    expect(body.insights[0].evidence).toEqual(["A1", "site:sc1", "email:em1"]);
    expect(body.opportunities.map((o) => o.title)).toEqual(["high", "low", "skip it"]);
    expect(body.opportunities[0].evidence).toEqual(["site:sc1"]);
    expect(body.opportunities[1].evidence).toEqual(["A1"]);
    expect("scores" in body.opportunities[0]).toBe(false);
  });
});
