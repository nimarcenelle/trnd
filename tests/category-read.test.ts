import { describe, expect, it } from "vitest";

import { checkReadBrief, templateReadBrief } from "../lib/read/brief";
import { exampleAds } from "../lib/read/example";
import { findGap, summarizeAdvertiser, type AdvertiserSummary } from "../lib/read/gap";
import { rivalCandidates, runCategoryRead, type ReadEvent } from "../lib/read/run";
import type { AdvertiserAd } from "../lib/signals/adlibrary-apify";

/**
 * The category read: a store's URL in, its live ads, its rivals'
 * long-running ads and the opening they keep paying for that it doesn't.
 */

const NOW = new Date("2026-09-24T12:00:00Z");

function ad(advertiser: string, id: string, runningDays: number | null, snippet: string, active = true): AdvertiserAd {
  const startedOn = runningDays === null ? null : new Date(NOW.getTime() - runningDays * 86400_000).toISOString().slice(0, 10);
  return { id, advertiser, snippet, headline: null, cta: null, landing: null, startedOn, runningDays, platforms: [], variants: 1, active, url: `https://x/${id}` };
}

const summary = (name: string, ads: AdvertiserAd[]): AdvertiserSummary => summarizeAdvertiser(name, `${name.toLowerCase()}.com`, ads);

describe("summarizeAdvertiser", () => {
  it("counts only live ads, leads with the longest-running, and reads openings from the ads still running", () => {
    const s = summary("Clearwell", [
      ad("Clearwell", "1", 90, "Sick of dry hair every winter. It's the water."),
      ad("Clearwell", "2", 30, "Watch the filter catch what your shower leaves behind."),
      ad("Clearwell", "3", 4, "20% off this weekend."),
      ad("Clearwell", "4", 200, "An old one.", false),
    ]);
    expect(s.active).toBe(3);
    expect(s.stillRunning).toBe(2);
    expect(s.longestDays).toBe(90);
    expect(s.top[0].id).toBe("1");
    // The four-day offer isn't counted while ads past three weeks exist.
    expect(s.openings).toEqual({ problem: 1, demonstration: 1 });
  });

  it("reads the whole live mix when nothing has run three weeks yet", () => {
    const s = summary("New", [ad("New", "1", 3, "20% off your first order."), ad("New", "2", 5, "Tired of flat hair every morning.")]);
    expect(s.stillRunning).toBe(0);
    expect(s.openings).toEqual({ offer: 1, problem: 1 });
  });
});

describe("findGap", () => {
  const rivals = [
    summary("A", [ad("A", "a1", 60, "Sick of dry skin all winter."), ad("A", "a2", 40, "My skin changed the week I did one thing.")]),
    summary("B", [ad("B", "b1", 80, "Tired of a crusty showerhead. That's on your skin too.")]),
    summary("C", [ad("C", "c1", 25, "Watch what hard water leaves behind.")]),
  ];

  it("names the opening most rivals keep running that the brand has none of", () => {
    const own = summary("Me", [ad("Me", "m1", 50, "Meet the filter that installs in a minute.")]);
    const gap = findGap(own, rivals);
    expect(gap.kind).toBe("missing");
    expect(gap.opening).toBe("problem");
    expect(gap.rivalsUsing).toBe(2);
    expect(gap.headline).toBe("2 of your 3 rivals keep ads running that open on the customer's problem. You have none live.");
    expect(gap.example?.advertiser).toBe("A");
    expect(gap.limit).toMatch(/not what it spent/);
  });

  it("tells a brand with no live ads which opening to enter with", () => {
    const gap = findGap(summary("Me", []), rivals);
    expect(gap.kind).toBe("no_ads");
    expect(gap.opening).toBe("problem");
    expect(gap.headline).toMatch(/^You have no Meta ads live\./);
  });

  it("finds an underweight opening when nothing is missing outright", () => {
    const own = summary("Me", [
      ad("Me", "m1", 50, "Sick of dry skin."),
      ad("Me", "m2", 50, "Meet the filter."),
      ad("Me", "m3", 50, "Introducing the refill."),
      ad("Me", "m4", 50, "The only filter with vitamin C."),
      ad("Me", "m5", 50, "My skin changed in a week."),
      ad("Me", "m6", 50, "Watch it work."),
    ]);
    const gap = findGap(own, rivals);
    expect(gap.kind).toBe("underweight");
    expect(gap.opening).toBe("problem");
    expect(gap.headline).toMatch(/Yours do 17% of the time\.$/);
  });

  it("says so when no rival ad could be read", () => {
    expect(findGap(null, []).kind).toBe("none");
    expect(findGap(null, [summary("Quiet", [])]).opening).toBeNull();
  });

  it("finds the problem-first gap in the example read", () => {
    const ads = exampleAds(NOW);
    const own = summary("Rinse", ads.Rinse);
    const theirs = ["Clearwell", "Softstream", "Aquaveil", "Hydrine"].map((n) => summary(n, ads[n]));
    const gap = findGap(own, theirs);
    expect(gap.kind).toBe("missing");
    expect(gap.opening).toBe("problem");
    expect(gap.headline).toBe("3 of your 4 rivals keep ads running that open on the customer's problem. You have none live.");
  });
});

describe("rivalCandidates", () => {
  it("drops marketplaces, the brand itself, bad domains and duplicates", () => {
    const b = (name: string, website: string) => ({ name, website, instagram: null, tiktok: null, why: "" });
    const out = rivalCandidates(
      [b("Amazon", "amazon.com"), b("Me", "me.com"), b("Real", "https://www.real.com/shop"), b("Real again", "real.com"), b("Nope", "not a domain"), b("Other", "other.co")],
      { name: "Me", domain: "me.com" },
    );
    expect(out.map((c) => c.domain)).toEqual(["real.com", "other.co"]);
  });
});

describe("checkReadBrief", () => {
  const input = {
    brand: "Rinse",
    category: "Shower filters",
    products: [{ name: "The Rinse Filter", price: "$68" }],
    siteText: "Refills ship every 90 days.",
    gap: findGap(null, []),
  };
  const brief = (hook: string) => ({ title: "t", product: "p", hypothesis: "h", hook, beats: [] });

  it("lets through a figure the site states and rejects one it doesn't", () => {
    expect(() => checkReadBrief(brief("Softer hair for $68."), input)).not.toThrow();
    expect(() => checkReadBrief(brief("93% of customers see softer hair."), input)).toThrow(/"93"/);
    expect(() => checkReadBrief(brief("3x softer hair."), input)).toThrow(/"3"/);
    expect(() => checkReadBrief(brief("Softer hair in 30 seconds, refills every 90 days."), input)).not.toThrow();
  });

  it("rejects a promised result", () => {
    expect(() => checkReadBrief(brief("Guaranteed softer hair."), input)).toThrow(/promises a result/);
  });

  it("writes a template brief with the brand's product and blanks to fill", () => {
    const t = templateReadBrief({ ...input, gap: { ...input.gap, opening: "problem" } });
    expect(t.product).toBe("The Rinse Filter");
    expect(t.beats).toHaveLength(3);
    expect(t.hook).toContain("[");
  });
});

describe("runCategoryRead", () => {
  const collect = async (website: string, deps: Parameters<typeof runCategoryRead>[2]) => {
    const events: ReadEvent[] = [];
    await runCategoryRead(website, (e) => events.push(e), deps);
    return events;
  };

  it("runs the example read end to end when no live keys are set", async () => {
    const events = await collect("anything.com", { live: () => false, now: () => NOW });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("status");
    expect(types).toContain("brief");
    expect(events.at(-1)).toEqual({ type: "done", example: true });
    expect(events.filter((e) => e.type === "advertiser")).toHaveLength(5);
  }, 10_000);

  it("streams the live read with its rivals' ads filtered to the rivals themselves", async () => {
    const events = await collect("me.com", {
      live: () => true,
      now: () => NOW,
      readSite: async (url) => ({ name: "Me", category: "Shower filters", city: "", region: null, website: url, priceBand: null, voiceHint: null, services: [{ name: "Filter", price: "$60" }], text: "A filter." }),
      readHandles: async () => ({ facebook: null }),
      propose: async () => [
        { name: "Alpha", website: "alpha.com", instagram: null, tiktok: null, why: "Same filter." },
        { name: "Ghost", website: "ghost.com", instagram: null, tiktok: null, why: "Made up." },
      ],
      siteLoads: async (d) => (d === "ghost.com" ? null : { facebook: null }),
      fetchAds: async (name) =>
        name === "Me"
          ? [ad("Me", "m1", 40, "Meet the filter.")]
          : [ad("Alpha", "a1", 70, "Sick of dry hair."), ad("Alpha Roofing", "x1", 90, "Tired of leaks.")],
      writeBrief: async (input) => templateReadBrief(input),
    });
    const rivals = events.find((e) => e.type === "rivals");
    expect(rivals && rivals.type === "rivals" ? rivals.rivals.map((r) => r.name) : null).toEqual(["Alpha"]);
    const alpha = events.find((e) => e.type === "advertiser" && e.role === "rival");
    expect(alpha && alpha.type === "advertiser" ? alpha.summary.active : null).toBe(1);
    const gap = events.find((e) => e.type === "gap");
    expect(gap && gap.type === "gap" ? gap.gap.headline : null).toBe("Alpha keeps ads running that open on the customer's problem. You have none live.");
    expect(events.at(-1)).toEqual({ type: "done", example: false });
  });

  it("ends with an error when the site can't be read, and keeps going when one ad read fails", async () => {
    const bad = await collect("me.com", { live: () => true, readSite: async () => Promise.reject(new Error("blocked")) });
    expect(bad.at(-1)?.type).toBe("error");

    const partial = await collect("me.com", {
      live: () => true,
      now: () => NOW,
      readSite: async (url) => ({ name: "Me", category: "c", city: "", region: null, website: url, priceBand: null, voiceHint: null, services: [], text: "" }),
      readHandles: async () => null,
      propose: async () => [{ name: "Alpha", website: "alpha.com", instagram: null, tiktok: null, why: "" }],
      siteLoads: async () => ({}),
      fetchAds: async (name) => (name === "Me" ? Promise.reject(new Error("apify down")) : [ad("Alpha", "a1", 70, "Sick of dry hair.")]),
      writeBrief: async (input) => templateReadBrief(input),
    });
    expect(partial.some((e) => e.type === "advertiser_failed" && e.role === "brand")).toBe(true);
    const gap = partial.find((e) => e.type === "gap");
    expect(gap && gap.type === "gap" ? gap.gap.kind : null).toBe("no_ads");
  });

  it("refuses an address that isn't one", async () => {
    const events = await collect("not a url at all", { live: () => true });
    expect(events).toEqual([{ type: "error", reason: expect.stringMatching(/web address/) }]);
  });
});
