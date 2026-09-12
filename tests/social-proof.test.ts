import { describe, expect, it } from "vitest";

import type { Signal } from "../lib/db/types";
import { buildSocialProof } from "../lib/recommend/social-proof";

const shorts = (value: number, raw: Record<string, unknown>): Signal => ({
  id: "s1",
  source: "youtube",
  term: "brunch chapel hill",
  normalized_term: "brunch_chapel_hill",
  category: "Restaurants & cafés",
  geo: "US-NC",
  metric_type: "shortform_views",
  value,
  delta_pct: null,
  window_days: 7,
  captured_at: "2026-09-12T12:00:00Z",
  raw,
});

describe("what short-form says", () => {
  it("stays off the page when the week is too thin to mean anything", () => {
    // The real case: one video, 159 views, a whole card, and a link to it.
    const out = buildSocialProof([shorts(159, { uploads: 1, medianDurationSec: 53, top: { id: "abc", title: "x" } })]);
    expect(out.summary).toBeNull();
    expect(out.href).toBeNull();
    expect(out.facts).toEqual([]);
  });

  it("links to the most-watched videos on the term, never the single top video", () => {
    const out = buildSocialProof([shorts(48_000, { uploads: 12, top: { id: "abc", title: "x" } })]);
    expect(out.summary).toMatch(/48K views/);
    // sp=CAMSAggD is YouTube's "uploaded this week, sorted by view count".
    expect(out.href).toBe("https://www.youtube.com/results?search_query=brunch%20chapel%20hill&sp=CAMSAggD");
  });
});
