import { describe, expect, it } from "vitest";

import { buildHowTo, isServiceTerm, trendLinks } from "../lib/recommend/howto";
import { buildOrganicPost } from "../lib/recommend/post";

describe("how-to playbook", () => {
  it("gives a service term the service playbook even when the shop resolves to retail", () => {
    const h = buildHowTo({ term: "bike tune up nyc", category: "full-service bicycle shop", city: "New York", source: "snapshot", serviceName: "Basic Tune-Up" });
    expect(h.contentAngle).toMatch(/Show the work/);
    expect(h.contentAngle).not.toMatch(/catalog shots/);
    expect(h.captionDirection).toMatch(/problem in the customer's words/);
  });

  it("keeps the retail playbook for a product term", () => {
    const h = buildHowTo({ term: "linen summer dress", category: "women's boutique", city: "Austin" });
    expect(h.contentAngle).toMatch(/One product/);
    expect(isServiceTerm("linen summer dress")).toBe(false);
    expect(isServiceTerm("hydraulic brake bleed")).toBe(true);
  });
});

describe("trend links", () => {
  it("opens platform search for a search phrase — its tag page would be empty", () => {
    const l = trendLinks("bike tune up nyc");
    expect(l.tiktok).toBe("https://www.tiktok.com/search?q=bike%20tune%20up%20nyc");
    expect(l.instagram).toContain("/explore/search/keyword/?q=bike%20tune%20up%20nyc");
  });

  it("links a real community tag to its tag page", () => {
    const l = trendLinks("hygiene routines", { hashtag: "hygienetok" });
    expect(l.tiktok).toBe("https://www.tiktok.com/tag/hygienetok");
  });
});

describe("organic post", () => {
  it("attributes a customer quote to the Google reviews it came from, never an anonymous guest", () => {
    const post = buildOrganicPost({ term: "bike tune up nyc", businessName: "Bicycle Habitat", copyHooks: ["Feels good to ride again."], hashtags: ["biketuneupnyc"] });
    expect(post).toContain("— from our Google reviews");
    expect(post).not.toMatch(/guest/);
  });
});
