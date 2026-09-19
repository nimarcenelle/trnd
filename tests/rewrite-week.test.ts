import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, NewPickBundle } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-rewrite-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");

/** Writing the week again clears what nobody decided on and the week's read; a chosen test stays. */

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "eskiin",
  category: "Shower filters",
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
  market: "online",
  monthly_ad_spend: null,
  ad_platforms: ["meta"],
});

const bundle = (title: string, rank: number): NewPickBundle => ({
  pick: { opportunity_id: null, rank, geo: "US", term: title.toLowerCase(), finding: "f", metric_label: "m", metric_value: null, metric_delta_pct: null, metric_window: "week", sparkline: [], bet_what: title, bet_budget_usd: 100, bet_duration_days: 5, bet_kill_rule: "", guardrail: null, concept_title: title, status: "ready" },
  evidence: [{ signal: "customer", claim: "c", source_url: null, source_label: null }],
  scripts: ["A", "B", "C"].map((label) => ({ variant_label: label, thesis: "t", hook: `h${label}`, beats: [], direction: { show: "s", say: "s", prove: "p" }, cta: "c", duration_seconds: 20 })),
});

describe("writing the week again", () => {
  beforeEach(() => resetStore());

  it("keeps the chosen test, drops the rest, and forgets the week's read", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    const week = "2026-09-14";
    const [a] = await repo.replaceWeekPicks(biz.id, week, [bundle("Chosen one", 1), bundle("Loose one", 2), bundle("Other one", 3)]);
    await repo.createPickRun({ pick_id: a, business_id: biz.id, status: "planned" });
    await repo.upsertStrategyRead({ business_id: biz.id, week_of: week, read: { situation: "x" }, coverage: {}, dossier_chars: 10, model_used: "m", prompt_version: "p" });

    await repo.replaceWeekPicks(biz.id, week, []);
    await repo.deleteStrategyRead(biz.id, week);

    const left = await repo.listReadyPicks(biz.id, week);
    expect(left.map((r) => r.pick.concept_title)).toEqual(["Chosen one"]);
    expect(await repo.getStrategyRead(biz.id, week)).toBeNull();
    expect(await repo.countWeekPicks(biz.id, week)).toBe(1);
  });
});
