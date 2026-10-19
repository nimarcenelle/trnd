import { describe, expect, it } from "vitest";

import { captionTags, mapCreativeCenter, mapRun, mapVideo, normHandle, normTag } from "@/lib/tiktok/read";

const item = {
  id: "7301",
  text: "Ranked 7 AI study tools #StudyTok #aitools",
  createTimeISO: "2026-10-12T18:00:00.000Z",
  webVideoUrl: "https://www.tiktok.com/@marlowstudies/video/7301",
  playCount: 240000,
  diggCount: 18000,
  commentCount: 900,
  shareCount: 1200,
  collectCount: 9100,
  hashtags: [{ name: "studytok" }, { name: "studyhacks" }],
  musicMeta: { musicName: "original sound", musicAuthor: "Marlow", musicOriginal: true },
  videoMeta: { duration: 44, coverUrl: "https://p16.example/cover.jpg" },
  authorMeta: { name: "MarlowStudies", nickName: "Marlow", fans: 41000, following: 120, heart: 900000, video: 210, signature: "Study smarter" },
};

describe("handles and tags", () => {
  it("accepts @handles and profile URLs", () => {
    expect(normHandle("@MarlowStudies")).toBe("marlowstudies");
    expect(normHandle("https://www.tiktok.com/@marlowstudies?lang=en")).toBe("marlowstudies");
    expect(normTag("#StudyTok")).toBe("studytok");
  });
  it("reads hashtags out of a caption, once each", () => {
    expect(captionTags("Part 1 #CollegeApps #essay #collegeapps")).toEqual(["collegeapps", "essay"]);
    expect(captionTags(null)).toEqual([]);
  });
});

describe("mapVideo", () => {
  it("maps the public counts, saves included, and merges listed and caption hashtags", () => {
    expect(mapVideo(item)).toEqual({
      videoId: "7301",
      author: "marlowstudies",
      url: "https://www.tiktok.com/@marlowstudies/video/7301",
      caption: "Ranked 7 AI study tools #StudyTok #aitools",
      hashtags: ["studytok", "studyhacks", "aitools"],
      sound: "original sound · Marlow",
      soundOriginal: true,
      durationS: 44,
      coverUrl: "https://p16.example/cover.jpg",
      postedAt: "2026-10-12T18:00:00.000Z",
      views: 240000,
      likes: 18000,
      comments: 900,
      shares: 1200,
      saves: 9100,
    });
  });
  it("degrades a renamed field to null instead of failing", () => {
    const v = mapVideo({ id: 9, authorMeta: { uniqueId: "fenn" }, plays: 10 });
    expect(v).toMatchObject({ videoId: "9", author: "fenn", views: null, saves: null, hashtags: [] });
    expect(mapVideo({ id: "1" })).toBeNull();
  });
});

describe("mapRun", () => {
  it("dedupes videos and keeps each author's numbers", () => {
    const { videos, authors } = mapRun([item, item, { ...item, id: "7302" }]);
    expect(videos.map((v) => v.videoId)).toEqual(["7301", "7302"]);
    expect(authors.get("marlowstudies")).toMatchObject({ followers: 41000, hearts: 900000, videos: 210, bio: "Study smarter" });
  });
});

describe("mapCreativeCenter", () => {
  it("reads tags under any of the field names actors use", () => {
    expect(mapCreativeCenter([{ hashtag_name: "#StudyTok", rank: 3, publish_cnt: 1200 }, { name: "seniorszn" }, { foo: 1 }])).toEqual([
      { tag: "studytok", rank: 3, posts: 1200, views: null },
      { tag: "seniorszn", rank: 2, posts: null, views: null },
    ]);
  });
});
