import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

// env.ts reads at module load and static imports hoist above assignments —
// set the env first, then import dynamically. A fake key is safe here: the
// gate under test returns before any model call.
process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-gate-"));
process.env.OPENAI_API_KEY = "test-key-never-called";

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { recommendForBusiness, weekOf } = await import("../lib/recommend/recommend");

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Bathhouse",
  category: "Health & beauty",
  city: "New York",
  region: "NY",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
  market: "local",
  monthly_ad_spend: null,
  ad_platforms: [],
});

describe("unjudged-ranking gate", () => {
  beforeEach(() => resetStore());

  it("holds an empty week for a new business until its analysis lands", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const user = createDemoRepo({ kind: "user", userId: "u1" });
    const biz = await user.createBusiness(bizInput("u1"));
    // A junk trend is sitting in the category pool, ready to be mis-ranked.
    await admin.upsertSignals([
      {
        source: "tiktok",
        term: "dental care advice",
        normalized_term: "dental_care_advice",
        category: biz.category,
        geo: "US",
        metric_type: "conversation",
        value: null,
        delta_pct: 100,
        window_days: 7,
        raw: {},
      },
    ]);

    // No brief yet + judge configured → nothing is persisted or graded.
    const result = await recommendForBusiness(user, biz);
    expect(result.created).toBe(0);
    expect(result.opportunityIds).toEqual([]);
    expect(await user.listOpportunities(biz.id, weekOf())).toEqual([]);
  });
});
