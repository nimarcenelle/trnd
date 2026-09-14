import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, NewPickBundle } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-skips-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "eskiin",
  category: "Beauty & wellness",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: "https://eskiin.com",
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  market: "online",
  monthly_ad_spend: "50-100k",
  ad_platforms: ["meta"],
});

const script = (label: string) => ({
  variant_label: label,
  thesis: "Problem first",
  hook: "Your shower is why your hair feels like straw",
  beats: [],
  direction: { show: "A real bathroom, the filter going on by hand in one shot.", say: "Name the problem the way the customer does.", prove: "What the filter removes, as the product page states it." },
  cta: "Shop the filter",
  duration_seconds: 20,
});

const bundle = (rank: number, term: string): NewPickBundle => ({
  pick: {
    opportunity_id: null,
    rank,
    geo: "US",
    term,
    finding: `Your customers are searching "${term}." Your product page says "Filtered Showerhead."`,
    metric_label: `Searches for "${term}"`,
    metric_value: 1000,
    metric_delta_pct: 20,
    metric_window: "week",
    sparkline: [],
    bet_what: "Problem-first video on Reels",
    bet_budget_usd: 2500,
    bet_duration_days: 5,
    bet_kill_rule: "Kill if cost per purchase runs 30% over your average by day 3",
    guardrail: null,
    grade: "B+",
    grade_score: 78,
    signal_scores: {},
    status: "ready",
  },
  evidence: [{ signal: "customer", claim: "Searches are up", source_url: null, source_label: null }],
  scripts: [script("A"), script("B"), script("C")],
});

describe("week skips and run verdicts in the demo repo", () => {
  beforeEach(() => resetStore());

  it("replaces a week's skips whole and lists them memory-first", async () => {
    const user = createDemoRepo({ kind: "user", userId: "u1" });
    const biz = await user.createBusiness(bizInput("u1"));
    const week = "2026-09-14";
    await user.replaceWeekSkips(biz.id, week, [
      { term: "labor day", normalized_term: "labor_day", kind: "hold", reason: "Not enough behind it", grade: "Hold", grade_score: 41 },
      { term: "glass skin", normalized_term: "glass_skin", kind: "memory", reason: "You ran this and killed it on Sep 2", grade: "Hold", grade_score: 49.9 },
      { term: "espresso martini", normalized_term: "espresso_martini", kind: "fit", reason: "Doesn't fit what you sell", grade: "Hold", grade_score: 30 },
      { term: "glass skin", normalized_term: "glass_skin", kind: "hold", reason: "duplicate", grade: "Hold", grade_score: 1 },
    ]);
    expect((await user.listWeekSkips(biz.id, week)).map((s) => [s.kind, s.term])).toEqual([
      ["memory", "glass skin"],
      ["fit", "espresso martini"],
      ["hold", "labor day"],
    ]);
    await user.replaceWeekSkips(biz.id, week, []);
    expect(await user.listWeekSkips(biz.id, week)).toEqual([]);
    expect(await createDemoRepo({ kind: "user", userId: "u2" }).listWeekSkips(biz.id, week)).toEqual([]);
  });

  it("keeps a run's verdict and lists feedback with its pick", async () => {
    const user = createDemoRepo({ kind: "user", userId: "u1" });
    const biz = await user.createBusiness(bizInput("u1"));
    const [id] = await user.replaceWeekPicks(biz.id, "2026-09-14", [bundle(1, "hard water")]);
    const run = await user.createPickRun({ pick_id: id, business_id: biz.id, status: "running" });
    const ended = await user.updatePickRun(run.id, { status: "completed", ended_at: "2026-09-20T00:00:00Z", verdict: "won" });
    expect(ended.verdict).toBe("won");
    expect((await user.listPickRuns(biz.id))[0].run.verdict).toBe("won");

    await user.createPickFeedback({ pick_id: id, business_id: biz.id, user_id: "u1", action: "dismissed", reason: "already_tried", note: null });
    const feedback = await user.listPickFeedback(biz.id);
    expect(feedback).toHaveLength(1);
    expect(feedback[0].feedback.reason).toBe("already_tried");
    expect(feedback[0].pick.term).toBe("hard water");
  });
});
