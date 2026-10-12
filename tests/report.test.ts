import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/openai", () => ({
  generateJson: vi.fn(async () => ({
    headline: "h",
    summary: "s",
    insights: [{ title: "t", detail: "d", evidence: ["A1", "MADE-UP"] }],
    plays: [{ title: "p", why: "w", brief: "b", inspired_by: ["MADE-UP", "A1"] }],
    rivals: [],
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

  it("drops archive ids the model made up", async () => {
    const body = await writeReport(input);
    expect(body.insights[0].evidence).toEqual(["A1"]);
    expect(body.plays[0].inspired_by).toEqual(["A1"]);
  });
});
