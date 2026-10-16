import { describe, expect, it } from "vitest";

import { NO_ADS_NOTE, NO_PAGE_NOTE, PAUSED_NOTE, rivalHidden } from "@/lib/format";

describe("which rivals the briefing shows", () => {
  it("hides a rival confirmed to run nothing, or paused, and only while it has no live ads", () => {
    expect(rivalHidden({ last_error: `${NO_ADS_NOTE}. Their Page runs nothing.` }, 0)).toBe(true);
    expect(rivalHidden({ last_error: `${NO_PAGE_NOTE}. Searched: "x".` }, 0)).toBe(true);
    expect(rivalHidden({ last_error: `${PAUSED_NOTE}: no active Meta ads; 4 past ads.` }, 0)).toBe(true);
    expect(rivalHidden({ last_error: `${NO_ADS_NOTE}.` }, 3)).toBe(false);
  });
  it("keeps a rival whose read merely failed, and one with no note yet", () => {
    expect(rivalHidden({ last_error: "Ad Library answered 403" }, 0)).toBe(false);
    expect(rivalHidden({ last_error: null }, 0)).toBe(false);
  });
});
