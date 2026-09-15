import { describe, expect, it } from "vitest";

import type { AdHistory, Signal } from "../lib/db/types";
import { killRuleFor, localDailyUsd, onlineTestBudgetUsd, pickBet } from "../lib/picks/bet";
import { buildEvidence, type EvidenceFacts } from "../lib/picks/evidence";
import { mentionsDelta, metricLabelFor, pickMetric, sparklineOf, stripDelta } from "../lib/picks/metric";

const signal = (over: Partial<Signal> = {}): Signal => ({
  id: "s1",
  source: "google_trends",
  term: "hard water",
  normalized_term: "hard_water",
  category: "Bath & shower",
  geo: "US",
  metric_type: "search_interest",
  value: 64,
  delta_pct: 48.6,
  window_days: 7,
  captured_at: "2026-09-12T00:00:00Z",
  raw: null,
  ...over,
});

const days = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    day: new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10),
    value: 40 + i,
  }));

describe("a pick's one metric", () => {
  it("prefers this week's measured change", () => {
    const m = pickMetric({ signal: signal(), weekPct: 48.64, monthPct: 12, series: days(10) });
    expect(m).toMatchObject({
      metric_label: 'Searches for "hard water"',
      metric_delta_pct: 48.6,
      metric_window: "week",
      // An interest index is relative to its own peak, not a level.
      metric_value: null,
    });
  });

  it("falls back to the 30-day change when there is no weekly read", () => {
    const m = pickMetric({ signal: signal({ delta_pct: null }), weekPct: null, monthPct: 22.25 });
    expect(m).toMatchObject({ metric_delta_pct: 22.3, metric_window: "30d" });
  });

  it("calls a search volume delta what it is: month over month", () => {
    const m = pickMetric({
      signal: signal({ source: "dataforseo", metric_type: "search_volume", value: 40500 }),
      weekPct: 31,
    });
    expect(m).toMatchObject({ metric_window: "30d", metric_value: 40500, metric_delta_pct: 31 });
  });

  it("has no metric when nothing was measured, which makes the pick a draft", () => {
    expect(pickMetric({ signal: signal({ delta_pct: null }), weekPct: null, monthPct: null, series: days(30) })).toBeNull();
  });

  it("names what was measured in the customer's words", () => {
    expect(metricLabelFor(signal({ source: "tiktok", metric_type: "shortform_views" }))).toBe('TikTok views on "hard water"');
    expect(metricLabelFor(signal({ source: "youtube", metric_type: "shortform_views" }))).toBe('YouTube Shorts views on "hard water"');
    expect(metricLabelFor(signal({ source: "dataforseo" }))).toBe('Searches for "hard water"');
    // A widened read labels the term the number was taken on.
    expect(metricLabelFor(signal({ raw: { adjusted: true, measuredTerm: "water softener" } }))).toBe(
      'Searches for "water softener"',
    );
  });

  it("draws the last 30 days, oldest first, without padding", () => {
    const line = sparklineOf([...days(45)].reverse());
    expect(line).toHaveLength(30);
    expect(line[0]).toEqual({ d: "2026-08-16", v: 55 });
    expect(line[29]).toEqual({ d: "2026-09-14", v: 84 });
    expect(sparklineOf(days(9))).toHaveLength(9);
  });

  it("finds and strips the figure the page already prints", () => {
    expect(mentionsDelta("up 49% this week", 48.6)).toBe(true);
    expect(mentionsDelta("up 149% this week", 48.6)).toBe(false);
    expect(stripDelta("Your ads ran 49% above your average.", 48.6)).toBe("Your ads ran above your average.");
  });
});

const ad = (over: Partial<AdHistory>): AdHistory => ({
  id: Math.random().toString(36).slice(2),
  business_id: "b1",
  platform: "meta",
  campaign_name: "Test",
  ad_name: null,
  copy: null,
  impressions: 20000,
  clicks: 400,
  spend_cents: 500000,
  results: null,
  ctr: null,
  started_on: null,
  ended_on: null,
  source: "meta_export",
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

describe("the bet", () => {
  const online = { market: "online" as const, category: "Bath & shower", monthly_ad_spend: "20-50k", price_band: null };

  it("sizes an online test at 5% of the spend band's floor over five days", () => {
    expect(onlineTestBudgetUsd("20-50k")).toBe(1000);
    expect(onlineTestBudgetUsd("250k-plus")).toBe(12500);
    expect(onlineTestBudgetUsd(null)).toBe(500);
    expect(pickBet(online, [])).toMatchObject({ bet_budget_usd: 1000, bet_duration_days: 5 });
  });

  it("sizes a local test from the price band's daily low end", () => {
    expect(localDailyUsd("$$")).toBe(25);
    expect(localDailyUsd("$")).toBe(15);
    const local = { market: "local" as const, category: "Health & beauty", monthly_ad_spend: null, price_band: "$$$" };
    expect(pickBet(local, [])).toMatchObject({ bet_budget_usd: 300, bet_duration_days: 6 });
  });

  it("kills on the account's own cost per purchase when it reports results", () => {
    const rows = [ad({ spend_cents: 100000, results: 20 }), ad({ spend_cents: 60000, results: 20 })];
    expect(killRuleFor(online, rows)).toBe("Kill if cost per purchase runs 30% over your account average ($40) by day 3");
  });

  it("kills on cost per click when the export has no results", () => {
    expect(killRuleFor(online, [ad({ spend_cents: 500000, clicks: 4000 })])).toBe(
      "Kill if cost per click runs 30% over your account average ($1.25) by day 3",
    );
  });

  it("kills on the category's click-through benchmark with no history", () => {
    expect(killRuleFor({ market: "local", category: "Health & beauty" }, [])).toBe(
      "Kill if click-through is under 1.8% after day 3",
    );
    expect(killRuleFor(online, [])).toBe("Kill if click-through is under 1.5% after day 3");
  });
});

const facts = (over: Partial<EvidenceFacts> = {}): EvidenceFacts => ({
  term: "hard water",
  signal: signal(),
  deltaPct: 48.6,
  online: true,
  audiencePhrase: null,
  shortform: null,
  rivalAds: [],
  rivalPosts: [],
  adLibrary: null,
  ownBestTheme: null,
  ownHistoryOnTerm: null,
  ownPost: null,
  ...over,
});

describe("evidence", () => {
  it("writes only the signals it has facts for", () => {
    const rows = buildEvidence(facts());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      signal: "customer",
      claim: 'Searches for "hard water" are rising across the US.',
      source_label: "Google Trends",
    });
    // A search claim names its source and links nowhere: the Trends page
    // never shows the window or scale that was measured.
    expect(rows[0].source_url).toBeNull();
  });

  it("writes nothing for an unmeasured watch term", () => {
    expect(buildEvidence(facts({ signal: signal({ source: "snapshot" }), deltaPct: null }))).toEqual([]);
  });

  it("links culture to the video itself and keeps the metric figure out of every claim", () => {
    const rows = buildEvidence(
      facts({
        audiencePhrase: "hard water hair",
        shortform: signal({
          source: "tiktok",
          metric_type: "shortform_views",
          raw: { top: { title: "Why 49% of homes have hard water", url: "https://www.tiktok.com/@a/video/1" }, medianDurationSec: 22.4 },
        }),
        rivalAds: [{ rival: "Jolie", text: "Filtered shower, softer hair", url: "https://www.facebook.com/ads/library/?id=1", runningDays: 40 }],
        ownPost: { caption: "Our hard water test kit", url: "https://instagram.com/p/1", platform: "instagram", engagement: 1240 },
        ownBestTheme: { theme: "education", vsAccount: 1.49, ads: 4 },
      }),
    );
    expect(rows.map((r) => r.signal)).toEqual(["customer", "customer", "culture", "culture", "competitive", "brand", "brand"]);
    const culture = rows.filter((r) => r.signal === "culture");
    expect(culture[0].source_url).toBe("https://www.tiktok.com/@a/video/1");
    expect(culture[1].claim).toBe("The TikTok videos winning on this run about 22 seconds.");
    expect(rows.find((r) => r.signal === "competitive")?.claim).toBe(
      'Jolie had a Meta ad on this that had been running 5 weeks when read: "Filtered shower, softer hair".',
    );
    for (const r of rows) expect(r.claim).not.toMatch(/(?<!\d)49\s?%/);
    // A different figure is a different fact and stays.
    expect(rows.some((r) => r.claim.includes("1,240 likes"))).toBe(true);
  });

  it("uses the keyword ad read only when no named rival said anything", () => {
    const rows = buildEvidence(facts({ adLibrary: { source: "meta_ads", term: "hard water", advertisers: [], count: 0 } }));
    expect(rows[1]).toMatchObject({ signal: "competitive", claim: 'No active Meta ads mentioning "hard water" were found when read.' });
    expect(rows[1].source_url).toContain("facebook.com/ads/library");
  });
});

describe("the line never draws an unfinished day", () => {
  it("drops today and a trailing partial-day zero, so the chip and the line agree", () => {
    const now = new Date("2026-09-15T04:00:00Z");
    const series = Array.from({ length: 12 }, (_, i) => ({ day: new Date(Date.UTC(2026, 8, 4 + i)).toISOString().slice(0, 10), value: 30 + i }));
    // Today (Sep 15) is 0 in Trends until it closes.
    const line = sparklineOf([...series, { day: "2026-09-15", value: 0 }], now);
    expect(line.at(-1)).toEqual({ d: "2026-09-14", v: 40 });
    // Yesterday captured as a partial zero is the same artifact.
    const partial = sparklineOf([...series.slice(0, -2), { day: "2026-09-14", value: 0 }], now);
    expect(partial.at(-1)).toEqual({ d: "2026-09-13", v: 39 });
    // A real zero inside a quiet stretch stays.
    const quiet = sparklineOf([{ day: "2026-09-10", value: 0 }, { day: "2026-09-11", value: 0 }, { day: "2026-09-12", value: 0 }, { day: "2026-09-13", value: 0 }], now);
    expect(quiet).toHaveLength(4);
  });
});
