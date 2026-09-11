import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

// A private demo store per run; no GEMINI_API_KEY, so the deterministic
// judge does the gating — which is the path a provisional ranking takes.
process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-provisional-"));

const { buildFallbackBrief, BRIEF_FALLBACK_MODEL } = await import("../lib/ai/brief");
const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { recommendForBusiness, weekOf } = await import("../lib/recommend/recommend");
const { WORTH_RUNNING } = await import("../lib/campaigns/auto");

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Glow Studio",
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
});

describe("the provisional first read", () => {
  beforeEach(() => resetStore());

  it("ranks the week immediately, and still throws out what doesn't fit", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "u1" });
    const business = await user.createBusiness(bizInput("u1"));
    const services = await user.createServices([
      {
        business_id: business.id,
        name: "Brow Lamination",
        description: null,
        price_cents: 9500,
        is_active: true,
      },
    ]);

    await admin.upsertSignals([
      {
        source: "google_trends",
        term: "brow lamination",
        normalized_term: "brow_lamination",
        category: business.category,
        geo: "US-GA",
        metric_type: "search_interest",
        value: 60,
        delta_pct: 40,
        window_days: 7,
        raw: {},
      },
      {
        // Nothing to do with what this business sells.
        source: "tiktok",
        term: "espresso martini",
        normalized_term: "espresso_martini",
        category: business.category,
        geo: "US",
        metric_type: "conversation",
        value: null,
        delta_pct: 100,
        window_days: 7,
        raw: {},
      },
    ]);

    // This is what onboarding now writes before it asks the model for
    // anything — milliseconds, from their own services.
    const provisional = buildFallbackBrief(business, services);
    expect(provisional.model_used).toBe(BRIEF_FALLBACK_MODEL);
    await user.upsertBusinessBrief(provisional);

    const result = await recommendForBusiness(admin, business);
    expect(result.created).toBeGreaterThan(0);

    const ranked = await user.listOpportunities(business.id, weekOf());
    const terms = await Promise.all(
      ranked.map(async (o) => (await admin.getSignal(o.signal_id))?.term),
    );
    // The week is real on the provisional read: what they actually sell
    // leads, and it clears the bar the unasked ad is written against.
    expect(terms[0]).toBe("brow lamination");
    expect(Number(ranked[0].score)).toBeGreaterThanOrEqual(WORTH_RUNNING);

    // And the fit gate still holds — a template watchlist never became
    // evidence of what this business sells, so the mismatch stays below the
    // bar (where the screen calls it out rather than pitching it).
    const junk = ranked.find((_, i) => terms[i] === "espresso martini");
    expect(junk).toBeDefined();
    expect(Number(junk!.score)).toBeLessThan(WORTH_RUNNING);
  });
});
