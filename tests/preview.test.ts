import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadAuthor, ReadVideo } from "@/lib/tiktok/read";

import { FakeDb } from "./fakes/supabase";

/** The free preview, end to end against an in-memory database, with TikTok reads and model calls faked. */

const db = { current: new FakeDb() };
const calls = { profiles: 0, hashtags: 0, account: 0, plans: 0 };
const world = { videos: 10 };

vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => db.current }));
vi.mock("@/lib/env", () => ({ env: {}, isModelConfigured: true, isStripeConfigured: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const DAY = 86_400_000;
const video = (author: string, id: string, d: number, views: number, tags: string[]): ReadVideo => ({
  videoId: id,
  author,
  url: null,
  caption: `video ${id}`,
  hashtags: tags,
  sound: null,
  soundOriginal: null,
  durationS: 30,
  coverUrl: null,
  postedAt: new Date(Date.now() - d * DAY).toISOString(),
  views,
  likes: 1,
  comments: 1,
  shares: 1,
  saves: 1,
});
const author = (handle: string, followers: number): ReadAuthor => ({ handle, displayName: handle, avatarUrl: null, bio: null, followers, following: 1, hearts: 1, videos: 10 });

vi.mock("@/lib/tiktok/read", async (orig) => {
  const actual = await orig<typeof import("@/lib/tiktok/read")>();
  return {
    ...actual,
    readProfiles: async (handles: string[]) => {
      calls.profiles++;
      const h = handles[0];
      if (h === "ghost") return { videos: [], authors: new Map(), failed: [h] };
      return { videos: Array.from({ length: world.videos }, (_, i) => video(h, `${h}${i}`, i * 3 + 3, 40_000 + i * 1000, ["studytok"])), authors: new Map([[h, author(h, 50_000)]]), failed: [] };
    },
    readHashtags: async () => {
      calls.hashtags++;
      const authors = new Map([
        ["peer1", author("peer1", 60_000)],
        ["peer2", author("peer2", 90_000)],
      ]);
      return { videos: ["peer1", "peer2"].flatMap((p) => [video(p, `${p}a`, 2, 300_000, ["studytok"]), video(p, `${p}b`, 9, 50_000, ["studytok"])]), authors };
    },
  };
});

vi.mock("@/lib/ai/creators", () => ({
  videoLine: (v: { video_id: string }) => `[${v.video_id}]`,
  readAccount: async () => {
    calls.account++;
    return { niche: ["Study"], audience: ["Students"], works: ["Series"], doesnt: [], style: "Cutouts", hashtags: ["StudyTok", "fyp"] };
  },
  writePlan: async () => {
    calls.plans++;
    const base = { so: "", script: [], length: "", sound: "", post_time: "", format: "", caption: "", hashtags: [], why: [], make_it_yours: "" };
    return {
      headline: "h",
      summary: "s",
      ideas: [
        { ...base, type: "borrow", hook: "a", source_video: "peer1a", source_trend: "" },
        { ...base, type: "double_down", hook: "b", source_video: "me0", source_trend: "" },
        { ...base, type: "ride", hook: "c", source_video: "", source_trend: "#StudyTok" },
      ],
      patterns: [],
    };
  },
}));
vi.mock("@/lib/creators/scan", () => ({ scanCreator: async () => ({}) }));
vi.mock("next/server", () => ({ after: () => undefined }));

const run = await import("@/lib/preview/run");
const { DAILY_BUDGET, PER_VISITOR_PER_DAY, clientIp, gate } = await import("@/lib/preview/limits");

beforeEach(() => {
  db.current = new FakeDb();
  Object.assign(calls, { profiles: 0, hashtags: 0, account: 0, plans: 0 });
  world.videos = 10;
});

async function finish(id: string) {
  for (let i = 0; i < 6; i++) await run.runStep(id);
  return run.getPreview(id);
}

describe("limits", () => {
  it("gates per visitor and on the daily budget", () => {
    expect(gate(0, 0)).toEqual({ ok: true });
    expect(gate(PER_VISITOR_PER_DAY, 0)).toEqual({ ok: false, reason: "visitor" });
    expect(gate(0, DAILY_BUDGET)).toEqual({ ok: false, reason: "budget" });
    expect(clientIp("1.2.3.4, 10.0.0.1", null)).toBe("1.2.3.4");
  });
});

describe("free preview", () => {
  it("reads, waits for 'that's me', then builds a plan with checked sources", async () => {
    const start = await run.startPreview("@Me", "1.1.1.1");
    if (!("id" in start)) throw new Error("blocked");
    let p = await finish(start.id);
    expect(p?.status).toBe("confirm");
    expect(calls.account).toBe(0);
    await run.confirmPreview(start.id, "followers");
    p = await finish(start.id);
    expect(p?.status).toBe("ready");
    expect(p?.hashtags).toEqual(["studytok"]);
    expect(p?.peers.map((x) => x.handle).sort()).toEqual(["peer1", "peer2"]);
    expect(p?.plan?.ideas.map((i) => [i.source_video, i.source_trend])).toEqual([
      ["peer1a", ""],
      ["me0", ""],
      ["", "studytok"],
    ]);
    expect(calls).toMatchObject({ profiles: 1, hashtags: 1, account: 1, plans: 1 });
  });

  it("reuses a recent preview of the same handle at no cost, and doesn't count it", async () => {
    const a = await run.startPreview("me", "1.1.1.1");
    const b = await run.startPreview("ME", "2.2.2.2");
    expect(b).toEqual(a);
    expect(db.current.rows("previews")).toHaveLength(1);
    expect(db.current.rows("preview_hits").find((r) => r.key === "all")?.count).toBe(1);
  });

  it("stops a visitor after their daily previews", async () => {
    for (let i = 0; i < PER_VISITOR_PER_DAY; i++) expect("id" in (await run.startPreview(`h${i}`, "9.9.9.9"))).toBe(true);
    expect(await run.startPreview("another", "9.9.9.9")).toEqual({ blocked: "visitor" });
    expect("id" in (await run.startPreview("another", "8.8.8.8"))).toBe(true);
  });

  it("says when the account can't be found, or has too few videos", async () => {
    const ghost = await run.startPreview("ghost", "1.1.1.1");
    expect((await finish((ghost as { id: string }).id))?.reason).toBe("not_found");
    world.videos = 2;
    const few = await run.startPreview("tiny", "1.1.1.1");
    expect(await finish((few as { id: string }).id)).toMatchObject({ status: "ineligible", reason: "few_videos" });
    expect(calls.account).toBe(0);
  });

  it("lets only one request run a step at a time", async () => {
    const s = (await run.startPreview("me", "1.1.1.1")) as { id: string };
    await Promise.all([run.runStep(s.id), run.runStep(s.id), run.runStep(s.id)]);
    expect(calls.profiles).toBe(1);
  });

  it("hands a ready preview to the new account once: videos, peers, profile and the plan", async () => {
    const s = (await run.startPreview("me", "1.1.1.1")) as { id: string };
    await finish(s.id);
    await run.confirmPreview(s.id, null);
    await finish(s.id);
    db.current.rows("creators").push({ id: "c1", handle: "me" });
    expect(await run.claimPreview(s.id, { id: "c1", handle: "me" })).toBe(true);
    expect(await run.claimPreview(s.id, { id: "c1", handle: "me" })).toBe(false);
    expect(db.current.rows("plans")).toHaveLength(1);
    expect(db.current.rows("peers")).toHaveLength(2);
    expect(db.current.rows("videos").filter((v) => v.is_self)).toHaveLength(10);
    expect(db.current.rows("creators")[0]).toMatchObject({ hashtags: ["studytok"], followers: 50_000 });
    // Another handle can't claim it.
    expect(await run.claimPreview(s.id, { id: "c2", handle: "other" })).toBe(false);
  });
});
