import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OUTPUT_TOKEN_CEILINGS } from "../lib/ai/gemini";
import { env } from "../lib/env";
import { fetchAdvertiserAds } from "../lib/signals/adlibrary-apify";
import {
  apifyUsage,
  capActorInput,
  MAX_RESULTS_PER_RUN,
  resetApifyUsage,
  runActorSync,
} from "../lib/social/apify";

/**
 * The margin guards. At $250 a brand a month with cost of goods dominated by
 * per-result Apify billing and Pro-tier Gemini calls, these ceilings are what
 * keeps one tenant from costing more than it pays. A change that removes one
 * should fail here, not on the invoice.
 */

const token = env.apifyToken;

beforeEach(() => {
  env.apifyToken = "tok";
  resetApifyUsage();
});

afterEach(() => {
  env.apifyToken = token;
  vi.restoreAllMocks();
});

/** A dataset far past any caller's request — an actor that ignored the limit. */
const oversized = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: String(i) })));

describe("Apify result ceiling", () => {
  it("truncates a dataset over the ceiling and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = await runActorSync<{ id: string }>("a/b", {}, { fetchText: async () => oversized(500) });

    expect(items).toHaveLength(MAX_RESULTS_PER_RUN);
    expect(items[0].id).toBe("0");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("500 results over the 40 ceiling");
  });

  it("leaves a dataset inside the ceiling alone and stays quiet", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = await runActorSync<{ id: string }>("a/b", {}, { fetchText: async () => oversized(12) });

    expect(items).toHaveLength(12);
    expect(warn).not.toHaveBeenCalled();
  });

  it("honours a caller asking for less, and never more", async () => {
    const few = await runActorSync<{ id: string }>(
      "a/b",
      {},
      { fetchText: async () => oversized(100), maxResults: 5 },
    );
    expect(few).toHaveLength(5);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const greedy = await runActorSync<{ id: string }>(
      "a/b",
      {},
      { fetchText: async () => oversized(100), maxResults: 1_000 },
    );
    expect(greedy).toHaveLength(MAX_RESULTS_PER_RUN);
  });

  it("lowers a limit the caller named without inventing one the actor never declared", () => {
    expect(capActorInput({ profiles: ["x"], resultsPerPage: 500 })).toEqual({
      profiles: ["x"],
      resultsPerPage: MAX_RESULTS_PER_RUN,
    });
    // Under the ceiling: the caller's own smaller number stands.
    expect(capActorInput({ startUrls: [], resultsLimit: 30 })).toEqual({ startUrls: [], resultsLimit: 30 });
    // An unknown key added here would be rejected by actors that validate
    // their input, turning a capped run into a paid failure.
    expect(capActorInput({ usernames: ["bellwood"] })).toEqual({ usernames: ["bellwood"] });
  });

  it("sends the capped input, not the caller's", async () => {
    const fetchText = vi.fn(async () => "[]");
    await runActorSync("a/b", { profiles: ["x"], resultsPerPage: 9_999 }, { fetchText });
    const [, init] = fetchText.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ profiles: ["x"], resultsPerPage: MAX_RESULTS_PER_RUN });
  });
});

describe("Apify spend counter", () => {
  it("records runs and the results actually kept", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await runActorSync("a/b", {}, { fetchText: async () => oversized(3) });
    await runActorSync("a/b", {}, { fetchText: async () => oversized(200) });

    expect(apifyUsage()).toEqual({ runs: 2, results: 3 + MAX_RESULTS_PER_RUN, truncated: 1 });
  });

  it("counts no run without a token", async () => {
    env.apifyToken = "";
    expect(await runActorSync("a/b", {}, { fetchText: async () => oversized(10) })).toEqual([]);
    expect(apifyUsage().runs).toBe(0);
  });
});

describe("Ad Library result ceiling", () => {
  it("keeps at most forty ads from one rival and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = Array.from({ length: 300 }, (_, i) => ({
      ad_archive_id: String(i),
      page_name: "Bellwood Bakery",
      is_active: true,
      snapshot: { body: { text: "Half off cold brew" } },
    }));

    const ads = await fetchAdvertiserAds("Bellwood Bakery", { fetchText: async () => JSON.stringify(items) });

    expect(ads).toHaveLength(40);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("300 ads over the 40 ceiling");
  });
});

describe("Gemini output token ceilings", () => {
  it("gives every call type a real, finite ceiling", () => {
    const entries = Object.entries(OUTPUT_TOKEN_CEILINGS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, cap] of entries) {
      expect(typeof cap, name).toBe("number");
      expect(cap, name).toBeGreaterThan(0);
      // Above the model's own 64K default is not a ceiling.
      expect(cap, name).toBeLessThanOrEqual(32_768);
    }
  });

  it("sizes the cheap calls below the creative ones", () => {
    const c = OUTPUT_TOKEN_CEILINGS;
    expect(c.verdict).toBeLessThan(c.digest);
    expect(c.digest).toBeLessThan(c.extract);
    expect(c.extract).toBeLessThanOrEqual(c.campaign);
    expect(c.fallback).toBe(c.campaign);
  });
});
