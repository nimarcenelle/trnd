import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Idea, IdeaRun, Video } from "@/lib/db/types";

import { FakeDb } from "./fakes/supabase";

const db = vi.hoisted(() => ({ current: null as unknown as FakeDb }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => db.current, createServerSupabase: async () => db.current }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/data", () => ({ getCreator: async () => ({ id: "c1", handle: "me" }) }));
vi.mock("@/lib/creators/scan", () => ({ scanCreator: async () => ({}) }));

const { markPostedAction } = await import("@/lib/actions");
const { default: IdeaCard, scriptText } = await import("@/components/app/idea-card");
const { CreatorsView, LoopView } = await import("@/components/app/views");

const video = (over: Partial<Video>): Video =>
  ({ id: "v1", creator_id: "c1", author: "me", is_self: true, video_id: "t1", url: "https://x", caption: "My pasta #food", hashtags: [], sound: null, sound_original: true, duration_s: 30, subtitle_url: null, spoken: null, cover_url: null, posted_at: "2026-10-30T00:00:00Z", views: 10, likes: 1, comments: 1, shares: 1, saves: 1, format: null, hook: null, first_seen_at: "", last_read_at: "", ...over }) as Video;
const idea: Idea = { type: "borrow", hook: '"One way in"', so: "s", script: [{ t: "0-2s", point: "Show the dish first", say: '"Look at this"', shot: "Dish" }], length: "30s", sound: "s", post_time: "t", format: "f", caption: "c", hashtags: [], why: [], make_it_yours: "m", source_video: "", source_trend: "" };
const run = (over: Partial<IdeaRun>): IdeaRun => ({ id: "r1", creator_id: "c1", plan_id: "p1", rank: 1, idea, expected: null, video_id: null, status: "planned", result: null, added_at: "2026-10-29T00:00:00Z", matched_at: null, ...over }) as IdeaRun;

beforeEach(() => {
  db.current = new FakeDb();
});

const post = (id: string, v: string) => {
  const f = new FormData();
  f.set("id", id);
  f.set("video", v);
  return markPostedAction(f);
};

describe("this is the one I posted", () => {
  it("links the video and starts the 48-hour check", async () => {
    db.current.rows("videos").push(video({}) as never);
    db.current.rows("idea_runs").push(run({}) as never);
    await post("r1", "v1");
    expect(db.current.rows("idea_runs")[0]).toMatchObject({ video_id: "v1", status: "posted" });
  });
  it("won't take someone else's video, a peer's video, or one another idea has", async () => {
    db.current.rows("videos").push(video({ id: "theirs", creator_id: "c2" }) as never, video({ id: "peer", is_self: false }) as never, video({ id: "used" }) as never);
    db.current.rows("idea_runs").push(run({}) as never, run({ id: "r2", video_id: "used", status: "posted" }) as never);
    for (const v of ["theirs", "peer", "used"]) await post("r1", v);
    expect(db.current.rows("idea_runs")[0]).toMatchObject({ video_id: null, status: "planned" });
  });
  it("offers your own unclaimed videos, and nothing once there are none", () => {
    const videos = [video({}), video({ id: "peer", is_self: false, caption: "Peer video" }), video({ id: "used", caption: "Used video" }), video({ id: "old", caption: "Old video", posted_at: "2026-09-01T00:00:00Z" })];
    const html = renderToStaticMarkup(createElement(LoopView, { runs: [run({}), run({ id: "r2", rank: 2, video_id: "used", status: "posted" })], videos }));
    expect(html).toContain("My pasta");
    expect(html).toContain("This is the one");
    for (const no of ["Peer video", "Old video"]) expect(html).not.toContain(no);
    expect(renderToStaticMarkup(createElement(LoopView, { runs: [run({})], videos: [] }))).not.toContain("This is the one");
  });
});

describe("the creators tab", () => {
  const card = (v: Video) => ({ peer: { id: "p", handle: "a", source: "owner", followers: 1, last_error: null, last_read_at: "x", reason: "" }, normal: { n: 1, views: 1, low: 1, high: 1, savesPerK: 1, commentsPerK: 1 }, best: { v, score: 50, parts: { beat: 0, fit: 1, fresh: 0, saved: 0 }, times: null, chosen: true }, growth: null }) as never;
  it("quotes words really said, never our read of a video", () => {
    const said = renderToStaticMarkup(createElement(CreatorsView, { cards: [card(video({ spoken: "Let us make soup today", hook: "Soup" }))] }));
    expect(said).toContain("“Let us make soup today”");
    const guess = renderToStaticMarkup(createElement(CreatorsView, { cards: [card(video({ hook: "Making soup at home" }))] }));
    expect(guess).toContain("Making soup at home");
    expect(guess).not.toContain("“Making soup at home”");
  });
});

describe("the idea card", () => {
  const render = (i: Idea) => renderToStaticMarkup(createElement(IdeaCard, { idea: i, rank: 1, planId: "p", source: { video: null, times: null, borrow: null, trend: null, own: false }, normal: { n: 0, views: null, low: null, high: null, savesPerK: null, commentsPerK: null }, run: null, open: true, sample: true }));
  it("gives each beat's job, with the wording as an example", () => {
    const html = render(idea);
    for (const s of ["Example opener", "The flow", "Show the dish first", "For example: “Look at this”", "Say it your way"]) expect(html).toContain(s);
    expect(html).not.toContain("The script");
    expect(scriptText(idea)).toContain("Example opener:");
    expect(scriptText(idea)).toContain("Example: \"Look at this\"");
  });
  it("still draws a plan written before beats had a job", () => {
    const html = render({ ...idea, script: [{ t: "0-2s", say: "Old line", shot: "Dish" }] });
    expect(html).toContain("Old line");
    expect(html).not.toContain("For example");
  });
});
