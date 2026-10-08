import { describe, expect, it } from "vitest";

import { buildBoard, diffReads, findMissing, SAMPLE_CAP } from "../lib/board/board";
import type { CompetitorRead, OwnAdRead } from "../lib/db/types";

/**
 * The board: every tracked competitor's paid ads against the brand's own,
 * what changed since the last read, and what the brand is missing.
 */

const NOW = new Date("2026-10-08T12:00:00Z");
const day = (d: number) => new Date(NOW.getTime() - d * 86400_000);
const ymd = (d: number) => day(d).toISOString().slice(0, 10);

type Ad = { id: string; started: number; text: string; platforms?: string[] };
const raw = (advertiser: string, ads: Ad[]) => ({
  source: "apify",
  ads: ads.map((a) => ({ id: a.id, advertiser, snippet: a.text, headline: null, startedOn: ymd(a.started), platforms: a.platforms ?? ["facebook", "instagram"], url: `https://x/${a.id}` })),
});
const rivalRead = (competitorId: string, name: string, readDaysAgo: number, ads: Ad[], active = ads.length): CompetitorRead => ({
  id: `${competitorId}-${readDaysAgo}`,
  competitor_id: competitorId,
  business_id: "b",
  kind: "ads",
  value: active,
  rating: null,
  summary: "",
  raw: raw(name, ads),
  captured_at: day(readDaysAgo).toISOString(),
});
const ownRead = (readDaysAgo: number, ads: Ad[]): OwnAdRead => ({ id: `own-${readDaysAgo}`, business_id: "b", active: ads.length, raw: raw("Jolie", ads), captured_at: day(readDaysAgo).toISOString() });

const competitors = [
  { id: "c1", name: "Clearwell", website: "https://clearwell.com", directness: 0.9 },
  { id: "c2", name: "Softstream", website: "https://softstream.com", directness: 0.8 },
  { id: "c3", name: "Aquaveil", website: "https://aquaveil.com", directness: 0.7 },
];

const many = (prefix: string, n: number, started: number, text: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, started, text }));

describe("buildBoard", () => {
  const reads = [
    rivalRead("c1", "Clearwell", 0, [
      { id: "a1", started: 120, text: "Sick of dry hair every winter. It's the water." },
      { id: "a2", started: 3, text: "20% off every filter this weekend." },
      ...many("cw", 6, 2, "New colorway just dropped."),
    ]),
    rivalRead("c2", "Softstream", 0, [
      { id: "b1", started: 90, text: "Tired of the crust on your showerhead." },
      { id: "b2", started: 4, text: "Free shipping and 15% off your first filter." },
      ...many("ss", 6, 1, "Rated 4.8 by thousands of customers."),
    ]),
    rivalRead("c3", "Aquaveil", 0, [{ id: "c1", started: 131, text: "Dry, dull hair after every wash is a water problem." }, ...many("aq", 5, 5, "Loved by 10,000 customers.")]),
  ];
  const own = [ownRead(0, [{ id: "j1", started: 112, text: "Meet the filtered showerhead that installs in five minutes.", platforms: ["facebook"] }])];

  it("lays out you against every competitor, latest read first", () => {
    const board = buildBoard({ business: { name: "Jolie", website: "https://jolieskinco.com" }, competitors, competitorReads: reads, ownReads: own, now: NOW });
    expect(board.you?.summary.active).toBe(1);
    expect(board.rivals.map((r) => r.name)).toEqual(["Clearwell", "Softstream", "Aquaveil"]);
    expect(board.rivals[0].summary?.active).toBe(8);
    expect(board.historyDays).toBe(1);
  });

  it("ranks what you're missing, each from a count of their ads", () => {
    const board = buildBoard({ business: { name: "Jolie", website: null }, competitors, competitorReads: reads, ownReads: own, now: NOW });
    const ids = board.missing.map((m) => m.id);
    expect(ids).toContain("opening:problem");
    expect(ids).toContain("angle:offer");
    expect(ids).toContain("volume");
    expect(ids).toContain("pace");
    expect(ids).toContain("placement:instagram");
    const offer = board.missing.find((m) => m.id === "angle:offer")!;
    expect(offer.headline).toBe("2 of your 3 competitors have an offer running. You don't.");
    expect(offer.example?.advertiser).toBeTruthy();
    expect(board.missing.find((m) => m.id === "volume")!.headline).toBe("Your competitors keep a median of 8 ads live. You have 1.");
    expect(board.missing.find((m) => m.id === "placement:instagram")!.headline).toBe("All 3 of your competitors run ads on Instagram. Yours don't.");
  });

  it("calls a brand with no ads live missing everything, and shows nothing without competitor reads", () => {
    const none = buildBoard({ business: { name: "Jolie", website: null }, competitors, competitorReads: reads, ownReads: [ownRead(0, [])], now: NOW });
    expect(none.missing[0].headline).toMatch(/^You have no Meta ads live\./);
    expect(findMissing(null, [])).toEqual([]);
  });
});

describe("diffReads", () => {
  it("reports launches, stops with how long they ran, and milestones crossed", () => {
    const yesterday = rivalRead("c1", "Clearwell", 1, [
      { id: "old", started: 59, text: "Hard water strips your hair." },
      { id: "gone", started: 9, text: "Our summer sale is here." },
    ]);
    const today = rivalRead("c1", "Clearwell", 0, [
      { id: "old", started: 60, text: "Hard water strips your hair." },
      { id: "new", started: 0, text: "Meet the travel filter." },
    ]);
    // Running days in the stored read are recomputed from start dates.
    yesterday.raw = raw("Clearwell", [
      { id: "old", started: 60, text: "Hard water strips your hair." },
      { id: "gone", started: 10, text: "Our summer sale is here." },
    ]);
    const changes = diffReads("Clearwell", false, [today, yesterday], NOW);
    expect(changes.find((c) => c.kind === "launched")).toMatchObject({ count: 1, text: "Meet the travel filter." });
    expect(changes.find((c) => c.kind === "stopped")).toMatchObject({ text: "Our summer sale is here.", days: 9 });
    expect(changes.find((c) => c.kind === "milestone")).toMatchObject({ days: 60 });
  });

  it("never calls an ad stopped when either read was truncated", () => {
    const big = SAMPLE_CAP + 10;
    const yesterday = rivalRead("c1", "Clearwell", 1, [{ id: "x", started: 20, text: "One." }], big);
    const today = rivalRead("c1", "Clearwell", 0, [{ id: "y", started: 30, text: "Two." }], big);
    expect(diffReads("Clearwell", false, [yesterday, today], NOW).some((c) => c.kind === "stopped")).toBe(false);
  });

  it("doesn't call an old ad that surfaced new", () => {
    const yesterday = rivalRead("c1", "Clearwell", 1, [{ id: "a", started: 10, text: "A." }]);
    const today = rivalRead("c1", "Clearwell", 0, [{ id: "a", started: 10, text: "A." }, { id: "b", started: 50, text: "B." }]);
    expect(diffReads("Clearwell", false, [yesterday, today], NOW).some((c) => c.kind === "launched")).toBe(false);
  });

  it("has nothing to say about a single read", () => {
    expect(diffReads("Clearwell", false, [rivalRead("c1", "Clearwell", 0, [{ id: "a", started: 1, text: "A." }])], NOW)).toEqual([]);
  });
});

describe("angleOf", () => {
  it("only calls copy an offer when it names one", async () => {
    const { angleOf } = await import("../lib/board/board");
    expect(angleOf("Meet the filtered showerhead that installs in five minutes.")).toBeNull();
    expect(angleOf("20% off every filter this weekend.")).toBe("offer");
    expect(angleOf("Free shipping on your first filter.")).toBe("offer");
    expect(angleOf("Rated 4.8 by thousands of customers.")).toBe("social_proof");
  });
});
