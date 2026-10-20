import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadVideo } from "@/lib/tiktok/read";

/** Covers kept in Storage at read time, with TikTok's CDN and the bucket faked. */

const uploads: { path: string; type: string; bytes: Buffer }[] = [];
const bucket = { fail: false };
vi.mock("@/lib/db/supabase", () => ({
  adminSupabase: () => ({
    storage: {
      from: (name: string) => ({
        upload: async (path: string, bytes: Buffer, opts: { contentType: string }) => {
          if (bucket.fail) return { error: { message: "bucket not found" } };
          uploads.push({ path, type: opts.contentType, bytes });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://db.example/storage/v1/object/public/${name}/${path}` } }),
      }),
    },
  }),
}));

const { coverPath, isCoverUrl, storeCovers } = await import("@/lib/preview/covers");

const video = (id: string, coverUrl: string | null): ReadVideo => ({
  videoId: id,
  author: "me",
  url: null,
  caption: null,
  hashtags: [],
  sound: null,
  soundOriginal: null,
  durationS: null,
  coverUrl,
  postedAt: null,
  views: 1,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
});

let png: Buffer;
beforeEach(async () => {
  uploads.length = 0;
  bucket.fail = false;
  png ??= await sharp({ create: { width: 720, height: 960, channels: 3, background: { r: 200, g: 40, b: 90 } } }).png().toBuffer();
});
afterEach(() => vi.unstubAllGlobals());

describe("isCoverUrl", () => {
  it("takes TikTok's image hosts over https only", () => {
    expect(isCoverUrl("https://p16-sign-va.tiktokcdn.com/obj/abc~tplv.jpeg?x=1")).toBe(true);
    expect(isCoverUrl("https://p19-sign.tiktokcdn-us.com/abc.image")).toBe(true);
    expect(isCoverUrl("http://p16-sign-va.tiktokcdn.com/abc.jpeg")).toBe(false);
    expect(isCoverUrl("https://tiktokcdn.com.evil.example/abc.jpeg")).toBe(false);
    expect(isCoverUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isCoverUrl("not a url")).toBe(false);
    expect(isCoverUrl(null)).toBe(false);
  });
});

describe("coverPath", () => {
  it("is the video id as a JPEG, and nothing for an id that is not one", () => {
    expect(coverPath("7301234567890123456")).toBe("7301234567890123456.jpg");
    expect(coverPath("../etc/passwd")).toBeNull();
    expect(coverPath("")).toBeNull();
  });
});

describe("storeCovers", () => {
  it("stores a small JPEG by video id and saves its public URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(png), { status: 200 })));
    const [v] = await storeCovers([video("123", "https://p16-sign-va.tiktokcdn.com/obj/123.png")]);
    expect(v.storedCover).toBe("https://db.example/storage/v1/object/public/covers/123.jpg");
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ path: "123.jpg", type: "image/jpeg" });
    const meta = await sharp(uploads[0].bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(240);
  });

  it("skips silently: no cover link, another host, a failed fetch, bytes that are not an image, a failed upload", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes("404") ? new Response("", { status: 404 }) : url.includes("junk") ? new Response("not an image") : new Response(new Uint8Array(png)),
    );
    vi.stubGlobal("fetch", fetcher);
    const got = await storeCovers([
      video("a", null),
      video("b", "https://example.com/b.jpeg"),
      video("c", "https://p16.tiktokcdn.com/404.jpeg"),
      video("d", "https://p16.tiktokcdn.com/junk.jpeg"),
    ]);
    expect(got.map((v) => v.storedCover ?? null)).toEqual([null, null, null, null]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(got[0]).toEqual(video("a", null));

    bucket.fail = true;
    const [e] = await storeCovers([video("e", "https://p16.tiktokcdn.com/e.jpeg")]);
    expect(e.storedCover).toBeUndefined();
  });

  it("stops starting new covers once its time is up", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array(png)));
    vi.stubGlobal("fetch", fetcher);
    let t = 0;
    const clock = () => (t += 15_000);
    const got = await storeCovers(
      ["1", "2", "3", "4"].map((id) => video(id, `https://p16.tiktokcdn.com/${id}.jpeg`)),
      1,
      clock,
    );
    expect(got.filter((v) => v.storedCover).length).toBeLessThan(4);
  });
});
