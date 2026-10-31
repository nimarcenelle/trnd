import { describe, expect, it } from "vitest";

import { topHashtags } from "@/lib/creators/stats";
import { cadence, videoTitle } from "@/lib/format";

describe("videoTitle", () => {
  it("strips hashtags at the start and end", () => {
    expect(videoTitle("#fyp Should he get her back? #looksmaxxing")).toBe("Should he get her back?");
  });
  it("shows the first three hashtags when that's all there is, even with a stray #", () => {
    expect(videoTitle("#motivation #breakup #selflove #discipline #")).toBe("#motivation #breakup #selflove");
  });
  it("cuts to 60 characters with an ellipsis", () => {
    const t = videoTitle("Sometimes healing is just about choosing yourself. The moment she let go, she found her glow.");
    expect(t).toBe("Sometimes healing is just about choosing yourself. The momen…");
    expect(t.length).toBe(61);
  });
  it("keeps hashtags in the middle", () => expect(videoTitle("My #1 tip for sleep")).toBe("My #1 tip for sleep"));
});

describe("cadence", () => {
  it("reads in words", () => {
    expect(cadence(1)).toBe("once a week");
    expect(cadence(2)).toBe("twice a week");
    expect(cadence(4.2)).toBe("4 times a week");
    expect(cadence(0.34)).toBe("about once every 3 weeks");
    expect(cadence(0.1)).toBe("less than once a month");
  });
});

describe("topHashtags", () => {
  it("counts each video once, most used first, without #fyp", () => {
    const v = (...h: string[]) => ({ hashtags: h });
    expect(topHashtags([v("fyp", "breakup", "breakup"), v("#Breakup", "glowup"), v("glowup", "selflove"), v("fyp", "advice")])).toEqual(["breakup", "glowup", "selflove"]);
  });
});
