import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Creator } from "@/lib/db/types";
import type { ReadAuthor, ReadVideo } from "@/lib/tiktok/read";

import { FakeDb } from "./fakes/supabase";

/**
 * The niche stage on a full list: matched creators who aren't ahead of the
 * account make room for ones who are, one for one, smallest first. Creators
 * the owner added stay, and removed ones never come back.
 */

const sample = { authors: new Map<string, ReadAuthor>(), videos: [] as ReadVideo[] };

vi.mock("@/lib/env", () => ({ env: {}, isModelConfigured: true, isStripeConfigured: false, isTiktokLoginConfigured: false }));
vi.mock("@/lib/email", () => ({ sendPlanEmail: async () => {} }));
vi.mock("@/lib/tiktok/connect", () => ({ readConnected: async () => null }));
vi.mock("@/lib/tiktok/read", async (orig) => ({ ...(await orig<typeof import("@/lib/tiktok/read")>()), readHashtags: async () => sample }));

const { nicheStage } = await import("@/lib/creators/scan");

const author = (handle: string, followers: number): ReadAuthor => ({ handle, displayName: handle, avatarUrl: null, bio: null, followers, following: 1, hearts: 1, videos: 10 });
const video = (author: string, id: string): ReadVideo => ({
  videoId: id,
  author,
  url: null,
  caption: `video ${id}`,
  hashtags: ["studytok"],
  sound: null,
  soundOriginal: null,
  durationS: 30,
  coverUrl: null,
  postedAt: new Date().toISOString(),
  views: 10_000,
  likes: 1,
  comments: 1,
  shares: 1,
  saves: 1,
});

const me = { id: "c1", handle: "me", followers: 50_000, hashtags: ["studytok"] } as Creator;
let db: FakeDb;

/** In the niche sample: these handles, with these followers. */
function inSample(people: Record<string, number>) {
  sample.authors = new Map(Object.entries(people).map(([h, f]) => [h, author(h, f)]));
  sample.videos = Object.keys(people).map((h) => video(h, `${h}-1`));
}
const peer = (handle: string, followers: number, source: "owner" | "match" = "match", removed_at: string | null = null) => ({ id: `p-${handle}`, creator_id: "c1", handle, followers, source, removed_at });
const live = () =>
  db
    .rows("peers")
    .filter((p) => !p.removed_at)
    .map((p) => p.handle)
    .sort();

beforeEach(() => {
  db = new FakeDb();
  // A full list of eight: two the owner added (both small), three matched ones behind, three ahead.
  db.rows("peers").push(
    peer("own1", 5_000, "owner"),
    peer("own2", 20_000, "owner"),
    peer("small", 10_000),
    peer("mid", 30_000),
    peer("near", 60_000),
    peer("big1", 150_000),
    peer("big2", 200_000),
    peer("big3", 300_000),
    peer("gone", 400_000, "match", "2026-10-01T00:00:00Z"),
  );
});

describe("nicheStage on a full list", () => {
  it("swaps matched creators behind for ones ahead, one for one, smallest out first", async () => {
    inSample({ ahead1: 500_000, ahead2: 800_000, equal: 55_000, gone: 600_000, own1: 900_000 });
    await nicheStage(db as never, me);
    // Two ahead found: the two smallest matched ones make room. Owner picks stay, however small.
    expect(live()).toEqual(["ahead1", "ahead2", "big1", "big2", "big3", "near", "own1", "own2"]);
    expect(db.rows("peers").find((p) => p.handle === "small")?.removed_at).toBeTruthy();
    expect(db.rows("peers").find((p) => p.handle === "mid")?.removed_at).toBeTruthy();
    // A creator the owner removed isn't picked again, and an owner pick isn't touched.
    expect(db.rows("peers").find((p) => p.handle === "gone")?.removed_at).toBe("2026-10-01T00:00:00Z");
    expect(db.rows("peers").find((p) => p.handle === "own1")).toMatchObject({ source: "owner", followers: 5_000 });
    expect(db.rows("peers").find((p) => p.handle === "ahead1")).toMatchObject({ source: "match", reason: "10× your followers · posts in 1 of your niche hashtags" });
  });

  it("swaps no more than there are creators ahead, and none for equals", async () => {
    inSample({ ahead1: 500_000, equal: 55_000 });
    await nicheStage(db as never, me);
    expect(live()).toEqual(["ahead1", "big1", "big2", "big3", "mid", "near", "own1", "own2"]);
  });

  it("leaves the list alone when every matched creator is already ahead", async () => {
    db.rows("peers").splice(0, db.rows("peers").length, peer("own1", 5_000, "owner"), ...["a", "b", "c", "d", "e", "f", "g"].map((h) => peer(h, 150_000)));
    inSample({ ahead1: 500_000, ahead2: 800_000 });
    await nicheStage(db as never, me);
    expect(live()).toEqual(["a", "b", "c", "d", "e", "f", "g", "own1"]);
  });
});
