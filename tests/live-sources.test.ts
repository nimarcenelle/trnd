import { describe, expect, it } from "vitest";

import { liveSources, liveSourcesLine, liveSourcesNote } from "../lib/signals/live-sources";

/** Settings names only the reads that run with the keys as set. */

describe("liveSources", () => {
  it("names what runs keyless, and lists the rest as waiting on a key", () => {
    const s = liveSources({ dataForSeo: false, youtube: false, apify: false, reddit: false, x: false, instagram: false });
    expect(liveSourcesLine(s)).toBe("Google Trends, Autocomplete, News, Weather, TikTok trending board");
    expect(s.off.map((o) => o.name)).toEqual(["Search volume by metro", "YouTube Shorts", "TikTok profiles", "Reddit", "Instagram posts", "X", "Rival Meta ads"]);
    expect(liveSourcesNote(s, false)).toBe(
      "Refreshed daily. Search reads are national until metro volume is available for your workspace. Not yet reading Search volume by metro, YouTube Shorts, TikTok profiles, Reddit, Instagram posts, X and Rival Meta ads.",
    );
  });

  it("claims YouTube and TikTok profiles only when their keys are set", () => {
    const s = liveSources({ dataForSeo: true, youtube: true, apify: true, reddit: true, x: false, instagram: false });
    expect(liveSourcesLine(s)).toBe("Search volume by metro, Google Trends, Autocomplete, News, Weather, YouTube Shorts, TikTok trending board, TikTok profiles, Reddit, Rival Meta ads");
    expect(liveSourcesNote(s, true)).toBe("Refreshed daily. Search volume is measured in your metro. Not yet reading Instagram posts and X.");
    const all = liveSources({ dataForSeo: true, youtube: true, apify: true, reddit: true, x: true, instagram: true });
    expect(all.off).toEqual([]);
    expect(liveSourcesNote(all, true)).toBe("Refreshed daily. Search volume is measured in your metro.");
  });
});
