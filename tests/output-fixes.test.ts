import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { apifyToken: "t" } }));

import { borrowScore, pickBorrow } from "@/lib/creators/stats";
import { openingLine, videoLead } from "@/lib/format";
import { mapVideo, parseVtt, readSpoken } from "@/lib/tiktok/read";

const now = Date.parse("2026-11-02T12:00:00Z");
const normal = { n: 12, views: 50_000, low: 30_000, high: 80_000, savesPerK: 8, commentsPerK: 3 };

describe("creators the owner picked", () => {
  const video = { views: 100_000, saves: 400, hashtags: ["other"], posted_at: new Date(now - 3 * 86_400_000).toISOString() };

  it("aren't marked down for using different hashtags", () => {
    const matched = borrowScore(video, normal, ["studytok"], { now });
    const picked = borrowScore(video, normal, ["studytok"], { now, chosen: true });
    expect(matched.parts.fit).toBe(0);
    expect(picked.parts.fit).toBe(1);
    expect(picked.score - matched.score).toBe(25);
    expect(picked.chosen).toBe(true);
  });

  const row = (author: string, score: number, chosen: boolean) => ({ v: { author }, score, chosen });

  it("get half the seats, shared between them, even with lower scores", () => {
    const rows = [...[90, 88, 86, 84, 82, 80].map((s, i) => row(`m${i}`, s, false)), row("a", 50, true), row("a", 49, true), row("a", 48, true), row("a", 47, true), row("b", 30, true)];
    const picks = pickBorrow(rows);
    expect(picks).toHaveLength(8);
    expect(picks.filter((p) => p.chosen)).toHaveLength(4);
    expect(picks.filter((p) => p.v.author === "b")).toHaveLength(1);
  });

  it("always get their best video in, under the bar the rest have to clear", () => {
    expect(pickBorrow([row("a", 12, true), row("m", 44, false)]).map((p) => p.v.author)).toEqual(["a"]);
  });

  it("leave spare seats to the rest, and take the rest's spare seats", () => {
    expect(pickBorrow([row("a", 60, true), ...[90, 80, 70, 65, 64, 63, 62, 61].map((s, i) => row(`m${i}`, s, false))])).toHaveLength(8);
    expect(pickBorrow([...[90, 80, 70, 65, 64, 63, 62, 61, 60, 59].map((s) => row("a", s, true)), row("m", 50, false)]).filter((p) => p.chosen)).toHaveLength(7);
  });

  it("change nothing for someone who picked nobody", () => {
    expect(pickBorrow([row("m", 90, false), row("n", 44, false)]).map((p) => p.v.author)).toEqual(["m"]);
  });
});

describe("what a video really says", () => {
  const vtt = "WEBVTT\n\n\n00:00:00.000 --> 00:00:03.940\nI have been making this every Halloween.\n\n00:00:03.941 --> 00:00:06.181\nYou can also <i>make</i> this too.\n\n00:00:06.182 --> 00:00:08.000\nYou can also make this too.\n";

  it("reads captions into plain lines", () => {
    expect(parseVtt(vtt)).toBe("I have been making this every Halloween.\nYou can also make this too.");
  });

  it("finds the caption link, preferring the original language to a translation", () => {
    const item = { id: "1", authorMeta: { name: "a" }, videoMeta: { subtitleLinks: [{ source: "MT", downloadLink: "https://x.tiktokcdn-us.com/mt" }, { source: "ASR", downloadLink: "https://x.tiktokcdn-us.com/asr" }] } };
    expect(mapVideo(item)?.subtitleUrl).toBe("https://x.tiktokcdn-us.com/asr");
    expect(mapVideo({ id: "2", authorMeta: { name: "a" } })?.subtitleUrl).toBeNull();
  });

  it("uses captions from TikTok only, skips borrowed sounds, and retries a failed link later", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      return url.includes("gone") ? new Response("", { status: 403 }) : new Response(vtt);
    });
    const out = await readSpoken([
      { video_id: "ok", subtitle_url: "https://v16m-webapp.tiktokcdn-us.com/a", sound_original: true },
      { video_id: "song", subtitle_url: "https://v16m-webapp.tiktokcdn-us.com/b", sound_original: false },
      { video_id: "gone", subtitle_url: "https://v16m-webapp.tiktokcdn-us.com/gone", sound_original: true },
      { video_id: "elsewhere", subtitle_url: "https://evil.example/a", sound_original: true },
      { video_id: "none", subtitle_url: null, sound_original: true },
    ]);
    vi.unstubAllGlobals();
    expect(out.get("ok")).toContain("Halloween");
    expect(out.get("song")).toBe("");
    expect(out.has("gone")).toBe(false);
    expect(out.has("elsewhere")).toBe(false);
    expect(out.has("none")).toBe(false);
    expect(fetched.some((u) => u.includes("evil") || u.endsWith("/b"))).toBe(false);
  });

  it("takes the opening from whole captions, at most 15 words", () => {
    expect(openingLine("Wait.\nThis is the part nobody tells you.\nNext line.")).toBe("Wait. This is the part nobody tells you.");
    expect(openingLine(Array(20).fill("word").join(" "))?.split(" ")).toHaveLength(15);
    expect(openingLine("")).toBeNull();
    expect(openingLine(null)).toBeNull();
  });

  it("puts only real words in quotation marks", () => {
    expect(videoLead({ spoken: "Let's make prosciutto di Parma.", hook: "Making prosciutto", caption: "c" })).toEqual({ text: "Let's make prosciutto di Parma.", quoted: true });
    expect(videoLead({ spoken: "", hook: "Making prosciutto", caption: "c" })).toEqual({ text: "Making prosciutto", quoted: false });
    expect(videoLead({ spoken: null, hook: null, caption: "From scratch #soup" })).toEqual({ text: "From scratch", quoted: false });
  });
});
