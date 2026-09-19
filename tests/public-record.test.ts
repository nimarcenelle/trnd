import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness, NewPickBundle } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-public-record-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { buildPublicRecord } = await import("../lib/record/public");

/** The public record sums every brand's tests with nothing named. */

const bizInput = (ownerId: string, name: string): NewBusiness => ({
  owner_id: ownerId,
  name,
  category: "Beauty & wellness",
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

const bundle = (title: string): NewPickBundle => ({
  pick: {
    opportunity_id: null,
    rank: 1,
    geo: "US",
    term: title.toLowerCase(),
    finding: "f",
    metric_label: "m",
    metric_value: null,
    metric_delta_pct: null,
    metric_window: "week",
    sparkline: [],
    bet_what: title,
    bet_budget_usd: 100,
    bet_duration_days: 5,
    bet_kill_rule: "",
    guardrail: null,
    concept_title: title,
    status: "ready",
  },
  evidence: [{ signal: "customer", claim: "c", source_url: null, source_label: null }],
  scripts: ["A", "B", "C"].map((label) => ({ variant_label: label, thesis: "t", hook: `h${label}`, beats: [], direction: { show: "s", say: "s", prove: "p" }, cta: "c", duration_seconds: 20 })),
});

describe("the public record", () => {
  beforeEach(() => resetStore());

  it("sums scored tests across brands, keeps the fidelity split, and names nothing", async () => {
    const a = createDemoRepo({ kind: "user", userId: "a" });
    const b = createDemoRepo({ kind: "user", userId: "b" });
    const bizA = await a.createBusiness(bizInput("a", "Brand A"));
    const bizB = await b.createBusiness(bizInput("b", "Brand B"));
    const [p1] = await a.replaceWeekPicks(bizA.id, "2026-09-07", [bundle("Won one")]);
    const [p2] = await b.replaceWeekPicks(bizB.id, "2026-09-07", [bundle("Lost one")]);
    const [p3] = await b.replaceWeekPicks(bizB.id, "2026-09-14", [bundle("Open one")]);
    const r1 = await a.createPickRun({ pick_id: p1, business_id: bizA.id, status: "running" });
    await a.updatePickRun(r1.id, { status: "completed", ended_at: "2026-09-10T00:00:00Z", verdict: "won", fidelity_score: 1 });
    const r2 = await b.createPickRun({ pick_id: p2, business_id: bizB.id, status: "running" });
    await b.updatePickRun(r2.id, { status: "killed", ended_at: "2026-09-12T00:00:00Z", fidelity_score: 0.25 });
    await b.createPickRun({ pick_id: p3, business_id: bizB.id, status: "running" });

    const record = await buildPublicRecord(createDemoRepo({ kind: "admin" }), new Date("2026-09-19T00:00:00Z"));
    expect(record).toMatchObject({ brands: 2, runs: 3, scored: 2, won: 1, lost: 1, open: 1, hitRate: 0.5 });
    expect(record.byFidelity).toEqual({ followed: { runs: 1, scored: 1, won: 1 }, strayed: { runs: 1, scored: 1, won: 0 }, unchecked: 1 });
    expect(record.series).toEqual([
      { day: "2026-09-10", won: 1, scored: 1, rate: 1 },
      { day: "2026-09-12", won: 1, scored: 2, rate: 0.5 },
    ]);
    expect(JSON.stringify(record)).not.toMatch(/Brand A|Brand B|Won one|Lost one/);
  });

  it("is empty-safe", async () => {
    const record = await buildPublicRecord(createDemoRepo({ kind: "admin" }));
    expect(record).toMatchObject({ brands: 0, runs: 0, scored: 0, hitRate: null, series: [] });
  });
});
