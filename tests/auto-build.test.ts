import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-auto-build-"));
delete process.env.GEMINI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { ensureWeekCampaign, shouldAutoBuild } = await import("../lib/campaigns/auto");
const { weekOf } = await import("../lib/recommend/recommend");

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "Glow Room",
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 12,
  website: null,
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  social_handles: {},
});

async function seed(score: number) {
  const admin = createDemoRepo({ kind: "admin" });
  const user = createDemoRepo({ kind: "user", userId: "owner" });
  const biz = await user.createBusiness(bizInput("owner"));
  const [facial] = await user.createServices([
    { business_id: biz.id, name: "Glass skin facial", description: null, price_cents: 14000, is_active: true },
  ]);
  await admin.upsertSignals([
    {
      source: "seed",
      term: "korean glass skin facial",
      normalized_term: "korean_glass_skin_facial",
      category: biz.category,
      geo: "US",
      metric_type: "conversation",
      value: 73,
      delta_pct: 47,
      window_days: 7,
      raw: null,
    },
  ]);
  const [signal] = await admin.listSignalsForCategory(biz.category, { sinceDays: 1 });
  const [top] = await admin.upsertOpportunities([
    {
      business_id: biz.id,
      signal_id: signal.id,
      week_of: weekOf(),
      score,
      rationale: "Rising fast; matches Glass skin facial.",
      matched_service_id: facial.id,
      competitor_gap: null,
      relevance: 0.9,
    },
  ]);
  return { admin, user, biz, top };
}

describe("the week's ad is written without being asked", () => {
  beforeEach(() => resetStore());

  it("builds the top pick once, and hands back the same campaign after that", async () => {
    const { user, biz, top } = await seed(7.4);
    expect(shouldAutoBuild(top, false, false)).toBe(true);
    const first = await ensureWeekCampaign(user, biz, top);
    expect(first).not.toBeNull();
    expect(first!.opportunity_id).toBe(top.id);
    expect((await user.listCreatives(first!.id)).length).toBeGreaterThan(0);
    // Second pass: nothing new is written — same id, still one campaign.
    const second = await ensureWeekCampaign(user, biz, top);
    expect(second!.id).toBe(first!.id);
    expect((await user.listCampaigns(biz.id)).length).toBe(1);
    expect((await user.getOpportunity(top.id))!.status).toBe("accepted");
  });

  it("leaves a thin pick and a passed pick to the owner", async () => {
    const { user, biz, top } = await seed(3.9);
    expect(shouldAutoBuild(top, false, false)).toBe(false);
    expect(await ensureWeekCampaign(user, biz, top)).toBeNull();
    expect((await user.listCampaigns(biz.id)).length).toBe(0);

    const strong = await seed(8.1);
    await strong.user.setOpportunityStatus(strong.top.id, "dismissed");
    const dismissed = (await strong.user.getOpportunity(strong.top.id))!;
    expect(shouldAutoBuild(dismissed, false, false)).toBe(false);
    expect(await ensureWeekCampaign(strong.user, strong.biz, dismissed)).toBeNull();
  });

  it("never builds past a locked plan", async () => {
    const { top } = await seed(8.1);
    expect(shouldAutoBuild(top, false, true)).toBe(false);
  });

  it("only writes for the business that owns the pick", async () => {
    const { admin, top } = await seed(8.1);
    const other = createDemoRepo({ kind: "user", userId: "someone-else" });
    const otherBiz = await other.createBusiness(bizInput("someone-else"));
    expect(await ensureWeekCampaign(admin, otherBiz, top)).toBeNull();
  });
});
