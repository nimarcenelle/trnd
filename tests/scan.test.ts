import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadAuthor, ReadVideo } from "@/lib/tiktok/read";

import { FakeDb } from "./fakes/supabase";

/**
 * A whole scan, end to end, against an in-memory database with TikTok reads
 * and model calls faked: the stages run in order, peers are matched, trends
 * snapshotted, a plan written with only sources it was given, and an idea the
 * creator added is matched to the video they post and checked after 48 hours.
 */

const db = { current: new FakeDb() };
const calls = { profiles: [] as string[][], hashtags: [] as string[][], plans: 0, tags: 0, emails: 0, handOffs: 0 };
const env = { cronSecret: "", siteUrl: "http://test", openaiApiKey: "k" };

vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => db.current }));
vi.mock("@/lib/env", () => ({ env, isModelConfigured: true, isStripeConfigured: false, isTiktokLoginConfigured: false }));
vi.mock("@/lib/email", () => ({ sendPlanEmail: async () => void calls.emails++ }));
vi.mock("@/lib/tiktok/connect", () => ({ readConnected: async () => null }));

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const video = (author: string, id: string, d: number, views: number, tags: string[], extra: Partial<ReadVideo> = {}): ReadVideo => ({
  videoId: id,
  author,
  url: null,
  caption: `video ${id} #${tags.join(" #")}`,
  hashtags: tags,
  sound: null,
  soundOriginal: null,
  durationS: 30,
  coverUrl: null,
  postedAt: ago(d),
  views,
  likes: views / 10,
  comments: views / 100,
  shares: 1,
  saves: views / 50,
  ...extra,
});
const author = (handle: string, followers: number): ReadAuthor => ({ handle, displayName: handle, avatarUrl: null, bio: null, followers, following: 1, hearts: 1, videos: 10 });

const world = {
  self: [] as ReadVideo[],
  extraSelf: [] as ReadVideo[],
  /** Handles whose Apify run died this read. */
  unread: [] as string[],
};
function resetWorld() {
  world.self = Array.from({ length: 10 }, (_, i) => video("me", `m${i}`, i * 3 + 3, i === 0 ? 400_000 : 40_000 + i * 1000, ["studytok"]));
  world.extraSelf = [];
  world.unread = [];
}

vi.mock("@/lib/tiktok/read", async (orig) => {
  const actual = await orig<typeof import("@/lib/tiktok/read")>();
  return {
    ...actual,
    isTiktokConfigured: () => true,
    readCreativeCenter: async () => [],
    readProfiles: async (handles: string[]) => {
      calls.profiles.push(handles);
      const videos: ReadVideo[] = [];
      const authors = new Map<string, ReadAuthor>();
      for (const h of handles) {
        if (world.unread.includes(h)) continue;
        if (h === "me") {
          videos.push(...world.self, ...world.extraSelf);
          authors.set("me", author("me", 50_000));
        } else if (h.startsWith("peer")) {
          videos.push(video(h, `${h}-hit`, 4, 900_000, ["studytok", "aitools"]), ...[1, 2, 3, 4].map((k) => video(h, `${h}-${k}`, 4 + k * 2, 60_000, ["studytok"])));
          authors.set(h, author(h, 80_000));
        }
      }
      return { videos, authors, failed: [], unread: handles.filter((h) => world.unread.includes(h)) };
    },
    readHashtags: async (tags: string[]) => {
      calls.hashtags.push(tags);
      const authors = new Map<string, ReadAuthor>();
      const videos: ReadVideo[] = [];
      for (const h of ["peer1", "peer2", "huge", "me"]) {
        authors.set(h, author(h, h === "huge" ? 90_000_000 : h === "me" ? 50_000 : 80_000));
        videos.push(video(h, `${h}-tag1`, 2, 50_000, ["studytok", "aitools"], { sound: "Lo-fi · Kai", soundOriginal: false }));
        videos.push(video(h, `${h}-tag2`, 9, 50_000, ["studytok"]));
      }
      return { videos, authors };
    },
  };
});

vi.mock("@/lib/ai/creators", () => ({
  videoLine: (v: { video_id: string }) => `[${v.video_id}]`,
  readAccount: async () => ({ niche: ["Study"], audience: ["Students"], works: ["Series"], doesnt: ["Ads"], style: "Cutouts", hashtags: ["#StudyTok", "fyp", "aitools"] }),
  tagVideos: async (vs: { video_id: string }[]) => {
    calls.tags++;
    return new Map(vs.map((v) => [v.video_id, { format: "tutorial", hook: `hook ${v.video_id}` }]));
  },
  writePlan: async () => {
    calls.plans++;
    const base = { so: "", script: [], length: "", sound: "", post_time: "", format: "", caption: "Seven study tools tested this week", hashtags: ["#studytok"], why: [], make_it_yours: "" };
    return {
      headline: "h",
      summary: "s",
      ideas: [
        { ...base, type: "double_down", hook: "Seven study tools tested honestly", source_video: "m0", source_trend: "" },
        // Claims a peer video it is not: the creator's own. Dropped.
        { ...base, type: "borrow", hook: "b", source_video: "m1", source_trend: "" },
        // The model echoes the key with a # and different case: still found.
        { ...base, type: "ride", hook: "r", source_video: "", source_trend: "#StudyTok" },
        { ...base, type: "ride", hook: "a fourth idea", source_video: "", source_trend: "" },
      ],
      patterns: [{ title: "p", detail: "d", videos: ["m0", "nope"] }],
    };
  },
}));

const { scanCreator } = await import("@/lib/creators/scan");

function seedCreator(extra: Record<string, unknown> = {}) {
  db.current.rows("creators").push({
    id: "c1",
    owner_id: "u1",
    handle: "me",
    hashtags: [],
    profile: null,
    profile_read_at: null,
    goals: null,
    plan: "trial",
    plan_status: "active",
    trial_ends_at: new Date(Date.now() + 10 * DAY).toISOString(),
    scan_status: "idle",
    scan_stage: null,
    scan_started_at: null,
    last_scan_at: null,
    plan_requested: false,
    tiktok_connected_at: null,
    followers: null,
    ...extra,
  });
}
const creator = () => db.current.rows("creators")[0];

beforeEach(() => {
  db.current = new FakeDb();
  Object.assign(calls, { profiles: [], hashtags: [], plans: 0, tags: 0, emails: 0, handOffs: 0 });
  env.cronSecret = "";
  resetWorld();
});

describe("scanCreator", () => {
  it("runs every stage and ends idle, with a plan built only from sources it was given", async () => {
    seedCreator();
    const res = await scanCreator("c1");
    expect(res.error).toBeUndefined();
    expect(res.stages).toEqual(["profile", "niche", "peers", "trends", "tag", "plan"]);
    const c = creator();
    expect(c).toMatchObject({ scan_status: "idle", scan_stage: null, followers: 50_000 });
    // The model's hashtags, cleaned: no #, lowercased, the broad ones dropped.
    expect(c.hashtags).toEqual(["studytok", "aitools"]);
    expect(c.profile_read_at).toBeTruthy();
    // Peers: inside the size band, not the 90M account, not the creator.
    expect(db.current.rows("peers").map((p) => p.handle).sort()).toEqual(["peer1", "peer2"]);
    expect(calls.profiles[1].sort()).toEqual(["peer1", "peer2"]);
    // Trends snapshotted today.
    expect(db.current.rows("trend_snapshots").some((t) => t.key === "studytok")).toBe(true);
    const plans = db.current.rows("plans");
    expect(plans).toHaveLength(1);
    const ideas = (plans[0].body as { ideas: { type: string; source_video: string; source_trend: string }[] }).ideas;
    expect(ideas).toHaveLength(3);
    expect(ideas[0].source_video).toBe("m0");
    expect(ideas[1].source_video).toBe("");
    expect(ideas[2].source_trend).toBe("studytok");
    expect((plans[0].body as { patterns: { videos: string[] }[] }).patterns[0].videos).toEqual(["m0"]);
    // The first plan is not emailed; it's on the page they are looking at.
    expect(calls.emails).toBe(0);
  });

  it("reads daily but writes a plan weekly, unless asked", async () => {
    seedCreator();
    await scanCreator("c1");
    await scanCreator("c1");
    expect(calls.plans).toBe(1);
    expect(calls.tags).toBe(1);
    creator().plan_requested = true;
    await scanCreator("c1");
    expect(calls.plans).toBe(2);
    expect(creator().plan_requested).toBe(false);
    expect(calls.emails).toBe(1);
  });

  it("re-reads the account weekly, not on every daily scan", async () => {
    seedCreator();
    await scanCreator("c1");
    const first = creator().profile_read_at;
    await scanCreator("c1");
    expect(creator().profile_read_at).toBe(first);
    creator().profile_read_at = ago(8);
    await scanCreator("c1");
    expect(creator().profile_read_at).not.toBe(ago(8));
  });

  it("never re-matches a peer the owner removed", async () => {
    seedCreator();
    await scanCreator("c1");
    const p1 = db.current.rows("peers").find((p) => p.handle === "peer1")!;
    p1.removed_at = new Date().toISOString();
    await scanCreator("c1");
    expect(db.current.rows("peers").filter((p) => p.handle === "peer1")).toHaveLength(1);
    expect(calls.profiles.at(-1)).toEqual(["peer2"]);
  });

  it("matches an added idea to the video posted and checks it after 48 hours", async () => {
    seedCreator();
    await scanCreator("c1");
    const plan = db.current.rows("plans")[0];
    db.current.rows("idea_runs").push({ id: "r1", creator_id: "c1", plan_id: plan.id, rank: 1, idea: (plan.body as { ideas: unknown[] }).ideas[0], expected: { low: 40_000, high: 46_000 }, video_id: null, status: "planned", result: null, added_at: ago(4) });
    world.extraSelf = [video("me", "new1", 1, 90_000, ["studytok"], { caption: "Seven study tools tested honestly this week" })];
    await scanCreator("c1");
    const run = db.current.rows("idea_runs")[0];
    expect(run.status).toBe("posted");
    // A day old: not checked yet.
    expect(run.result).toBeNull();
    world.extraSelf = [video("me", "new1", 3, 90_000, ["studytok"], { caption: "Seven study tools tested honestly this week" })];
    await scanCreator("c1");
    expect(db.current.rows("idea_runs")[0]).toMatchObject({ status: "checked", result: { views: 90_000, read: "beat" } });
  });

  it("leaves a posted idea unchecked rather than inventing a result when it has no numbers", async () => {
    seedCreator();
    await scanCreator("c1");
    world.extraSelf = [video("me", "new2", 3, 0, ["studytok"], { caption: "Seven study tools tested honestly", views: null })];
    db.current.rows("idea_runs").push({ id: "r2", creator_id: "c1", plan_id: "x", rank: 1, idea: { hook: "Seven study tools tested honestly", caption: "", hashtags: [] }, expected: null, video_id: null, status: "planned", result: null, added_at: ago(5) });
    await scanCreator("c1");
    expect(db.current.rows("idea_runs")[0]).toMatchObject({ status: "posted", result: null });
  });

  it("carries on inline when it cannot hand off (no CRON_SECRET), instead of stopping mid-scan", async () => {
    seedCreator();
    const res = await scanCreator("c1", { budgetMs: 0 });
    expect(res.handedOff).toBe(false);
    expect(res.stages).toHaveLength(6);
    expect(creator().scan_status).toBe("idle");
  });

  it("hands the next stage to a fresh function when over budget, and resumes from it", async () => {
    seedCreator();
    env.cronSecret = "s";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const res = await scanCreator("c1", { budgetMs: 0 });
    expect(res).toMatchObject({ handedOff: true, stages: ["profile"] });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/cron/scan?creator=c1&resume=1");
    expect(creator()).toMatchObject({ scan_status: "running", scan_stage: "niche" });
    fetchSpy.mockRestore();
    const rest = await scanCreator("c1", { resume: true });
    expect(rest.stages).toEqual(["niche", "peers", "trends", "tag", "plan"]);
    expect(creator().scan_status).toBe("idle");
  });

  it("follows a redirect on the hand-off by hand, so the secret reaches the host that answers", async () => {
    seedCreator();
    env.cronSecret = "s";
    env.siteUrl = "https://usetrnd.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { location: "https://www.usetrnd.test/api/cron/scan?creator=c1&resume=1" } }))
      .mockResolvedValueOnce(new Response("{}"));
    const res = await scanCreator("c1", { budgetMs: 0 });
    env.siteUrl = "http://test";
    expect(res).toMatchObject({ handedOff: true, stages: ["profile"] });
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual(["https://usetrnd.test/api/cron/scan?creator=c1&resume=1", "https://www.usetrnd.test/api/cron/scan?creator=c1&resume=1"]);
    for (const [, init] of fetchSpy.mock.calls) expect(init).toMatchObject({ redirect: "manual", headers: { authorization: "Bearer s" } });
    fetchSpy.mockRestore();
  });

  it("carries on inline when the route refuses the hand-off", async () => {
    seedCreator();
    env.cronSecret = "s";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const res = await scanCreator("c1", { budgetMs: 0 });
    expect(res).toMatchObject({ handedOff: false });
    expect(res.stages).toHaveLength(6);
    expect(warn.mock.calls.some((c) => /refused the cron secret/.test(String(c[0])))).toBe(true);
    fetchSpy.mockRestore();
    warn.mockRestore();
  });

  it("keeps a peer's last read when its run died, rather than calling it private or renamed", async () => {
    seedCreator();
    await scanCreator("c1");
    const peer1 = () => db.current.rows("peers").find((p) => p.handle === "peer1")!;
    const before = peer1().last_read_at;
    expect(before).toBeTruthy();
    world.unread = ["peer1"];
    await scanCreator("c1");
    expect(peer1()).toMatchObject({ last_error: null, last_read_at: before });
  });

  it("says TikTok didn't answer, not that the account can't be read, when the creator's own run died", async () => {
    seedCreator();
    world.unread = ["me"];
    const res = await scanCreator("c1");
    expect(res.error).toMatch(/didn't answer/);
    expect(res.error).not.toMatch(/couldn't read/);
  });

  it("refuses a second scan while one is running, and stops when the handle changes under it", async () => {
    seedCreator({ scan_status: "running", scan_stage: "peers", scan_started_at: new Date().toISOString() });
    expect((await scanCreator("c1")).error).toBe("Already running");
    creator().scan_status = "idle";
    creator().handle = "someoneelse";
    // A scan started for "me" (loaded), then the handle changed: simulate by changing it after the first load.
    const orig = db.current.from.bind(db.current);
    let loads = 0;
    db.current.from = (t: string) => {
      if (t === "creators" && ++loads === 3) creator().handle = "renamed";
      return orig(t);
    };
    creator().handle = "me";
    const res = await scanCreator("c1");
    expect(res.error).toBe("Handle changed");
  });

  it("records a failure as an error the setup page can show", async () => {
    seedCreator({ handle: "ghost" });
    const res = await scanCreator("c1");
    expect(res.error).toMatch(/couldn't read @ghost/);
    expect(creator()).toMatchObject({ scan_status: "error", scan_stage: null });
  });
});
