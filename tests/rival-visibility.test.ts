import { describe, expect, it } from "vitest";

import { NO_ADS_NOTE, NO_PAGE_NOTE, PAUSED_NOTE, rivalHidden, safeText } from "@/lib/format";

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

describe("text that must survive JSON", () => {
  it("drops a half emoji left by a character trim and keeps whole ones", () => {
    const cut = "Softer hair \u{1F4A7}".slice(0, 13); // the trim splits the droplet in two
    expect(JSON.parse(JSON.stringify(safeText(cut)))).toBe("Softer hair ");
    expect(safeText("Softer hair \u{1F4A7} now")).toBe("Softer hair \u{1F4A7} now");
  });
});
