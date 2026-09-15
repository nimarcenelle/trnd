import { afterEach, describe, expect, it } from "vitest";

import type { NewProviderUsage, ProviderUsage } from "../lib/db/types";
import { withAiContext } from "../lib/ai/usage";
import { cleanNote, estimateCents, recordProviderUsage, setProviderUsageSink, summarizeProviderUsage } from "../lib/usage/providers";

/**
 * The meter on paid provider calls: every row is tagged with the brand and
 * the job, every cent is an estimate that says so, and a failure is kept
 * without the secret that was in the URL.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("recording a provider call", () => {
  const rows: NewProviderUsage[] = [];
  afterEach(() => {
    rows.length = 0;
    setProviderUsageSink(null);
  });

  it("tags the row with the job context and estimates from the public rate", async () => {
    setProviderUsageSink(async (r) => {
      rows.push(r);
    });
    await withAiContext({ businessId: "b1", purpose: "week:deepen" }, async () => {
      recordProviderUsage({ provider: "apify", operation: "apify/instagram-scraper", rateKey: "apify:result", units: 250 });
    });
    await flush();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ business_id: "b1", purpose: "week:deepen", provider: "apify", units: 250, unit_label: "results", basis: "estimate", ok: true });
    expect(rows[0].est_cost_cents).toBe(100);
    expect(rows[0].note).toMatch(/assumed/);
  });

  it("keeps a failure's reason without the token or the address", async () => {
    setProviderUsageSink(async (r) => {
      rows.push(r);
    });
    recordProviderUsage({
      provider: "apify",
      operation: "x",
      rateKey: "apify:run",
      units: 1,
      ok: false,
      note: "HTTP 402 from https://api.apify.com/v2/acts/x?token=abc123secret\nstack line two",
    });
    await flush();
    expect(rows[0].ok).toBe(false);
    expect(rows[0].note).toBe("HTTP 402 from (url)");
    expect(rows[0].note).not.toMatch(/abc123secret/);
  });

  it("leaves the cost null when no rate is known", () => {
    expect(estimateCents("nope", 10)).toBeNull();
    expect(estimateCents("dataforseo:keyword", 1000)).toBe(5);
    expect(cleanNote("token=abc&x=1 then https://a.b/c")).toBe("token=…&x=1 then (url)");
  });
});

describe("summarizing usage", () => {
  const row = (over: Partial<ProviderUsage>): ProviderUsage => ({
    id: "1",
    business_id: "b1",
    provider: "apify",
    operation: "op",
    units: 10,
    unit_label: "results",
    est_cost_cents: 4,
    basis: "estimate",
    purpose: "week:deepen",
    ok: true,
    note: null,
    created_at: "2026-09-15T00:00:00Z",
    ...over,
  });

  it("adds up by provider and by job, counts failures, and says it is an estimate", () => {
    const s = summarizeProviderUsage([
      row({}),
      row({ id: "2", est_cost_cents: 6, purpose: "week:scan" }),
      row({ id: "3", provider: "dataforseo", units: 100, est_cost_cents: 0.5, ok: false }),
    ]);
    expect(s.calls).toBe(3);
    expect(s.failed).toBe(1);
    expect(s.estCostCents).toBe(10.5);
    expect(s.byProvider.apify).toEqual({ calls: 2, units: 20, estCostCents: 10, failed: 0 });
    expect(s.byProvider.dataforseo.failed).toBe(1);
    expect(s.byPurpose["week:deepen"].calls).toBe(2);
    expect(s.basis).toBe("estimate");
  });
});
