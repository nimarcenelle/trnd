import { describe, expect, it } from "vitest";

import { FORMATS, formatLabel, normalizeFormat } from "@/lib/creators/formats";
import { baseHitRate, formatCallable, formatLine, formatRows, formatWorking } from "@/lib/creators/stats";

const now = Date.parse("2026-11-07T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

let n = 0;
const vid = (author: string, format: string | null, views: number, age: number, is_self = false) => ({ video_id: `v${++n}`, author, is_self, format, views, posted_at: daysAgo(age) });

describe("normalizeFormat", () => {
  it("keeps a format from the list and maps the free text stored before it", () => {
    for (const f of FORMATS) expect(normalizeFormat(f)).toBe(f);
    expect(normalizeFormat("Ranked list")).toBe("ranked list");
    expect(normalizeFormat("top 3 list")).toBe("ranked list");
    expect(normalizeFormat("comparison")).toBe("ranked list");
    expect(normalizeFormat("talking head tip")).toBe("quick tip");
    expect(normalizeFormat("talking head rant")).toBe("talking head");
    expect(normalizeFormat("costume skit")).toBe("pov skit");
    expect(normalizeFormat("costume lip sync")).toBe("trend or challenge");
    expect(normalizeFormat("costume reveal")).toBe("outfit or look");
    expect(normalizeFormat("costume teaser")).toBe("outfit or look");
    expect(normalizeFormat("song promo")).toBe("song teaser");
    expect(normalizeFormat("original song performance")).toBe("music performance");
    expect(normalizeFormat("motivational edit")).toBe("montage or clip");
    expect(normalizeFormat("study with me")).toBe("day in my life");
    expect(normalizeFormat("grwm")).toBe("get ready with me");
    expect(normalizeFormat("product reaction")).toBe("reaction");
  });
  it("returns null for what fits none", () => {
    expect(normalizeFormat("unknown")).toBeNull();
    expect(normalizeFormat("")).toBeNull();
    expect(normalizeFormat(null)).toBeNull();
  });
  it("shows the list's name in sentence case", () => {
    expect(formatLabel("top 3 list")).toBe("Ranked list");
    expect(formatLabel("pov skit")).toBe("POV skit");
    expect(formatLabel("q&a reply")).toBe("Q&A reply");
    expect(formatLabel("magic trick")).toBe("Magic trick");
  });
});

describe("formatRows", () => {
  // Every creator's usual is 10K views: 20K or more is a hit.
  const normals = new Map(["a", "b", "c", "d", "me"].map((h) => [h, { views: 10_000 }]));
  const videos = [
    // Ranked lists: 7 in the last 30 days from three creators, 4 hits from three of them; stored under three names.
    vid("a", "ranked list", 40_000, 3),
    vid("a", "top 3 list", 8_000, 5),
    vid("b", "ranked list", 25_000, 6),
    vid("b", "comparison", 9_000, 9),
    vid("c", "ranked list", 30_000, 10),
    vid("c", "ranked list", 20_000, 12),
    vid("c", "ranked list", 5_000, 20),
    // The 30 days before: 2 videos, no hits.
    vid("a", "ranked list", 6_000, 40),
    vid("b", "ranked list", 7_000, 45),
    // Too new to count, and too old.
    vid("d", "ranked list", 900_000, 1),
    vid("d", "ranked list", 900_000, 70),
    // Tutorials: plenty of videos but one creator.
    ...[1, 2, 3, 4, 5, 6, 7].map((k) => vid("d", "tutorial", 50_000, k + 2)),
    // A creator with no usual yet: left out.
    vid("x", "ranked list", 99_000, 4),
    // Untagged.
    vid("a", null, 10_000, 4),
    // The creator's own.
    vid("me", "top 5 ranking", 12_000, 15, true),
    vid("me", "ranked list", 8_000, 50, true),
  ];
  const rows = formatRows(videos, normals, now);
  const ranked = rows.find((r) => r.format === "ranked list")!;
  const tutorial = rows.find((r) => r.format === "tutorial")!;

  it("counts videos, creators and hits against each video's own creator", () => {
    expect(ranked).toMatchObject({ videos: 7, creators: 3, hits: 4, hitCreators: 3, hitRate: 0.57, medianX: 2 });
    expect(ranked.prior).toEqual({ videos: 2, hits: 0, hitRate: 0 });
    expect(ranked.best?.v.author).toBe("a");
    expect(ranked.best?.times).toBe(4);
  });
  it("leaves out the 30 days before while most of it is untagged, rather than calling it none", () => {
    const untagged = [...videos, ...[41, 42, 43].map((d) => vid("c", null, 10_000, d))];
    expect(formatRows(untagged, normals, now).find((r) => r.format === "ranked list")!.prior).toBeNull();
    expect(formatLine(formatRows(untagged, normals, now)[0], null)).not.toContain("30 days before");
  });
  it("says whether the creator has used it", () => {
    // Two videos, 1.2× and 0.8×: the middle is the lower one, a number a video actually got.
    expect(ranked.mine).toEqual({ videos: 2, last: daysAgo(15), medianX: 0.8 });
    expect(tutorial.mine).toEqual({ videos: 0, last: null, medianX: null });
  });
  it("gates noise: one creator's run of tutorials is not a format working for creators ahead of you", () => {
    expect(tutorial).toMatchObject({ videos: 7, creators: 1, hits: 7 });
    expect(formatCallable(ranked)).toBe(true);
    expect(formatCallable(tutorial)).toBe(false);
    expect(rows[0].format).toBe("ranked list");
  });
  it("calls a format working against the hit rate of everything they post", () => {
    const base = baseHitRate(videos, normals, now);
    // 11 of 15 settled peer videos in the window with a usual, untagged ones included: the tutorials drive it.
    expect(base).toBe(0.73);
    expect(formatWorking(ranked, base)).toBe(false);
    expect(formatWorking(ranked, 0.2)).toBe(true);
    expect(formatWorking({ ...ranked, hitCreators: 1 }, 0.2)).toBe(false);
  });
  it("reads to the plan with the numbers behind it", () => {
    const line = formatLine(ranked, 0.2);
    expect(line).toContain("[ranked list] 4 of 7 videos from 3 creators ahead hit 2× their usual (57%, against 20% across everything they posted)");
    expect(line).toContain("30 days before: 2 videos, 0% hit 2×");
    expect(line).toContain(`best example: [${ranked.best!.v.video_id}] @a, 4× their usual`);
    expect(line).toContain("you posted 2, middle one 0.8× your usual");
    expect(formatLine(tutorial, null)).toContain("you haven't posted one");
  });
});
