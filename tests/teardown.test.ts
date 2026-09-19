import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";
import type { StrategyRead } from "../lib/research/strategist";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-teardown-"));
delete process.env.OPENAI_API_KEY;

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");
const { renderTeardown, runAccountRead } = await import("../lib/prospect/teardown");

/**
 * The free account read: a prospect's brand read into a shadow business
 * the founder owns, and the teardown email written from the strategist's
 * read. A shadow brand never reaches a cron.
 */

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "My own brand",
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

const read: StrategyRead = {
  situation: "eskiin sells filtered showerheads to people who blame their shampoo. The rivals all lead with skin; nobody leads with the water.",
  insights: [
    { area: "customer", insight: "Customers describe the problem as hair, not water.", evidence: ["12 comments say frizz"], confidence: "high", why_confidence: "twelve comments, three reviews" },
    { area: "competitive", insight: "Every rival leads with the filter's stages.", evidence: ["7 of 9 ads"], confidence: "medium", why_confidence: "two rivals read" },
    { area: "brand", insight: "The brand's own ads have never shown the crust.", evidence: ["0 of 40 ads"], confidence: "low", why_confidence: "copy only, no creative read" },
  ],
  tensions: [],
  whitespace: ["Nobody shows the showerhead itself."],
  angles: [
    { priority: 2, title: "The crust", product: "Filtered Showerhead", the_bet: "Open on the scale.", why_now: "The searches are up.", differs_from_rivals: "They show skin.", evidence: ["x"], risk: "Gross-out.", format_hint: "talking head" },
    { priority: 1, title: "Blame the water", product: "Filtered Showerhead", the_bet: "Say it is the water, not the shampoo.", why_now: "That is how customers say it.", differs_from_rivals: "Nobody says it.", evidence: ["y"], risk: "Claims.", format_hint: "UGC" },
  ],
  unknowns: ["Whether the brand has footage."],
  do_not: [],
};

describe("the teardown email", () => {
  it("quotes the situation, the strongest insights, the top angles in priority order and what was not read", () => {
    const { subject, body } = renderTeardown({
      brand: "eskiin",
      read,
      coverage: { rivalsNamed: 3, rivalsDirect: 2, rivalsWithAdsRead: 2, rivalAdsStored: 9, ownPosts: 0, rivalPosts: 0, ownAdRows: 0, ownAdSource: null, comments: 12, reviews: 3, documents: 0, termsWithVolume: 10, termsWithSeries: 0, sources: [], missing: ["No ad results on file."] },
      services: [{ name: "Filtered Showerhead" }],
    });
    expect(subject).toBe("eskiin: three creative tests worth running, and why");
    expect(body).toContain("WHERE YOU ARE\neskiin sells filtered showerheads");
    const lines = body.split("\n");
    const first = lines.findIndex((l) => l.startsWith("1. "));
    expect(lines[first]).toContain("Blame the water");
    expect(lines[first + 1]).toContain("The crust");
    expect(body).toContain("- Customers describe the problem as hair, not water. (high confidence");
    expect(body.indexOf("high confidence")).toBeLessThan(body.indexOf("low confidence"));
    expect(body).toContain("- No ad results on file.");
    expect(body).toContain("2 rivals' live ads (9 ads), 15 customer comments and reviews");
    expect(body).toContain("The record of every test we brief is public.");
  });

  it("says so when there is no read, and never invents one", () => {
    const { subject, body } = renderTeardown({ brand: "eskiin", read: null, coverage: null, services: [{ name: "a" }, { name: "b" }] });
    expect(subject).toBe("eskiin: a free read of your account");
    expect(body).toContain("(2 products)");
    expect(body).toContain("I would rather not send you a guess");
    expect(body).not.toContain("THREE TESTS");
  });
});

describe("the shadow brand", () => {
  beforeEach(() => resetStore());

  it("lands under the founder, out of every listing the crons use, and never becomes the founder's own brand", async () => {
    const admin = createDemoRepo({ kind: "admin" });
    const mine = createDemoRepo({ kind: "user", userId: "founder" });
    const own = await mine.createBusiness(bizInput("founder"));
    const teardown = await runAccountRead(
      admin,
      { website: "https://eskiin.com", ownerId: "founder" },
      {
        intelBudgetMs: 1,
        readSite: async (url) => ({
          name: "eskiin",
          category: "Shower filters",
          city: "",
          region: null,
          website: url,
          priceBand: "$$",
          voiceHint: null,
          services: [{ name: "Filtered Showerhead", price: "68" }, { name: "Replacement Filter", price: "" }],
          text: "eskiin filtered showerhead",
        }),
      },
    );
    expect(teardown.brand).toBe("eskiin");
    expect(teardown.subject).toContain("eskiin");
    const shadow = await admin.getBusiness(teardown.businessId);
    expect(shadow).toMatchObject({ prospect: true, owner_id: "founder", name: "eskiin", market: "online" });
    expect((await admin.listServices(teardown.businessId)).map((s) => s.price_cents)).toEqual([6800, null]);
    expect((await admin.listAllBusinesses()).map((b) => b.id)).toEqual([own.id]);
    expect((await admin.listAllBusinesses({ includeProspects: true })).map((b) => b.id).sort()).toEqual([own.id, teardown.businessId].sort());
    // The founder's own app still opens on the founder's own brand.
    expect((await mine.getBusinessByOwner("founder"))?.id).toBe(own.id);
    expect((await mine.getBusinessForUser({ id: "founder" }))?.id).toBe(own.id);
  });
});
