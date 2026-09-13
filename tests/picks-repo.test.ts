import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, NewPickBundle } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-picks-"));

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
  beats: [{ visual: "Crust on a showerhead", on_screen_text: "This is on your skin", vo: "" }],
  cta: "Shop the filter",
  duration_seconds: 20,
});

const bundle = (rank: number, over: Partial<NewPickBundle> = {}): NewPickBundle => ({
  pick: {
    opportunity_id: null,
    rank,
    geo: "US",
    term: `term ${rank}`,
    finding: `Your customers are searching "term ${rank}." Your product page says "Filtered Showerhead."`,
    metric_label: `Searches for "term ${rank}"`,
    metric_value: 1000,
    metric_delta_pct: 20,
    metric_window: "week",
    sparkline: [],
    bet_what: "Problem-first video on Reels",
    bet_budget_usd: 2500,
    bet_duration_days: 5,
    bet_kill_rule: "Kill if cost per purchase runs 30% over your account average by day 3",
    guardrail: null,
    status: "ready",
  },
  evidence: [{ signal: "customer", claim: "People are searching it", source_url: null, source_label: null }],
  scripts: [script("A"), script("B"), script("C")],
  ...over,
});

const WEEK = "2026-09-14";

describe("a week of picks in the store", () => {
  beforeEach(() => resetStore());

  it("lists ready picks by rank and keeps a broken one out as a draft", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    await repo.replaceWeekPicks(biz.id, WEEK, [bundle(2), bundle(1), bundle(3, { scripts: [script("A")] })]);
    const list = await repo.listReadyPicks(biz.id, WEEK);
    expect(list.map((r) => r.pick.rank)).toEqual([1, 2]);
    const detail = await repo.getPickDetail(list[0].pick.id);
    expect(detail?.scripts.map((s) => s.variant_label)).toEqual(["A", "B", "C"]);
    expect(detail?.evidence).toHaveLength(1);
    expect(detail?.run).toBeNull();
  });

  it("drops a dismissed pick from the list but still loads it by link", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    const [first] = await repo.replaceWeekPicks(biz.id, WEEK, [bundle(1), bundle(2)]);
    await repo.createPickFeedback({ pick_id: first, business_id: biz.id, user_id: "owner", action: "dismissed", reason: "off_brand", note: null });
    expect((await repo.listReadyPicks(biz.id, WEEK)).map((r) => r.pick.rank)).toEqual([2]);
    expect((await repo.getPickDetail(first))?.dismissed).toBe(true);
  });

  it("puts a running pick under campaigns and keeps it when the week is regenerated", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    const [first] = await repo.replaceWeekPicks(biz.id, WEEK, [bundle(1), bundle(2)]);
    const run = await repo.createPickRun({ pick_id: first, business_id: biz.id, status: "running" });
    await repo.replaceWeekPicks(biz.id, WEEK, [bundle(1), bundle(2), bundle(3)]);
    const runs = await repo.listPickRuns(biz.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].pick.id).toBe(first);
    expect((await repo.listReadyPicks(biz.id, WEEK)).find((r) => r.pick.id === first)?.run?.status).toBe("running");
    await repo.updatePickRun(run.id, { status: "killed", ended_at: new Date().toISOString() });
    expect((await repo.listPickRuns(biz.id))[0].run.status).toBe("killed");
  });

  it("never shows one owner's picks to another", async () => {
    const owner = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await owner.createBusiness(bizInput("owner"));
    const [first] = await owner.replaceWeekPicks(biz.id, WEEK, [bundle(1)]);
    const stranger = createDemoRepo({ kind: "user", userId: "stranger" });
    expect(await stranger.getPickDetail(first)).toBeNull();
    expect(await stranger.listReadyPicks(biz.id, WEEK)).toEqual([]);
  });
});
