import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/openai", () => ({
  generateJson: vi.fn(async () => ({
    headline: "h",
    summary: "s",
    insights: [{ title: "t", detail: "d", evidence: ["A1", "MADE-UP"] }],
    plays: [{ title: "p", why: "w", brief: "b", inspired_by: ["MADE-UP", "A1"] }],
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
    expect(prompt.indexOf("[A1] · 72d running")).toBeGreaterThan(-1);
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
  });

  it("drops archive ids the model made up", async () => {
    const body = await writeReport(input);
    expect(body.insights[0].evidence).toEqual(["A1"]);
    expect(body.plays[0].inspired_by).toEqual(["A1"]);
  });
});
