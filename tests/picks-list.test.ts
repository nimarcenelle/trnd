import { describe, expect, it } from "vitest";

import {
  GENERATION_SETTLE_MS,
  GENERATION_STALE_MS,
  arrowGlyph,
  dueForKick,
  generationDecision,
  legacyPickIndex,
  runChip,
  shortDate,
  truncateFinding,
  weekRangeLabel,
} from "../lib/picks/list";

describe("runChip", () => {
  it("labels each run status", () => {
    expect(runChip("running")).toEqual({ label: "Running", tone: "amber" });
    expect(runChip("completed")).toEqual({ label: "Completed", tone: "mint" });
    expect(runChip("killed")).toEqual({ label: "Killed", tone: "faint" });
  });

  it("gives no chip to a pick nobody ran", () => {
    expect(runChip(null)).toBeNull();
    expect(runChip(undefined)).toBeNull();
  });
});

describe("arrowGlyph", () => {
  it("points the way the metric moved", () => {
    expect(arrowGlyph("up")).toBe("↑");
    expect(arrowGlyph("down")).toBe("↓");
    expect(arrowGlyph("flat")).toBe("→");
  });
});

describe("truncateFinding", () => {
  it("leaves a short finding alone, whitespace collapsed", () => {
    expect(truncateFinding("  Your customers   say\n hard water. ")).toBe("Your customers say hard water.");
  });

  it("cuts on a word and ends with one ellipsis", () => {
    const text = 'Your customers are searching "hard water." Your product page says "Wall Mount Filtered Showerhead."';
    const out = truncateFinding(text, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("Your customers are searching \"hard water.\" Your…");
  });

  it("drops punctuation left dangling before the ellipsis", () => {
    expect(truncateFinding("Demand is up, sharply, across the whole state this week", 16)).toBe("Demand is up…");
  });

  it("still cuts one enormous word", () => {
    const out = truncateFinding("a".repeat(300), 20);
    expect(out).toBe(`${"a".repeat(19)}…`);
  });
});

describe("weekRangeLabel and shortDate", () => {
  it("spans Monday to Sunday", () => {
    expect(weekRangeLabel("2026-09-14")).toBe("Sep 14 – Sep 20");
  });

  it("crosses a month", () => {
    expect(weekRangeLabel("2026-09-28")).toBe("Sep 28 – Oct 4");
  });

  it("reads the date in UTC", () => {
    expect(shortDate("2026-09-14T23:30:00Z")).toBe("Sep 14");
  });
});

describe("legacyPickIndex", () => {
  it("maps ?pick=n to a 0-based index when the pick exists", () => {
    expect(legacyPickIndex("1", 5)).toBe(0);
    expect(legacyPickIndex("5", 5)).toBe(4);
    expect(legacyPickIndex(["3", "4"], 5)).toBe(2);
  });

  it("rejects out-of-range and junk values", () => {
    expect(legacyPickIndex("6", 5)).toBeNull();
    expect(legacyPickIndex("0", 5)).toBeNull();
    expect(legacyPickIndex("2", 0)).toBeNull();
    expect(legacyPickIndex("2abc", 5)).toBeNull();
    expect(legacyPickIndex("-1", 5)).toBeNull();
    expect(legacyPickIndex(undefined, 5)).toBeNull();
    expect(legacyPickIndex("", 5)).toBeNull();
  });
});

describe("generationDecision", () => {
  const now = 1_000_000_000_000;

  it("kicks when nothing was kicked", () => {
    expect(generationDecision(undefined, now)).toBe("kick");
  });

  it("waits on a job still running, and retries one that went quiet", () => {
    expect(generationDecision({ state: "running", at: now - 60_000 }, now)).toBe("wait");
    expect(generationDecision({ state: "running", at: now - GENERATION_STALE_MS }, now)).toBe("kick");
  });

  it("settles a finished job instead of looping, until the window passes", () => {
    expect(generationDecision({ state: "done", at: now - 60_000, ready: 0 }, now)).toBe("settled");
    expect(generationDecision({ state: "done", at: now - GENERATION_SETTLE_MS, ready: 0 }, now)).toBe("kick");
  });
});

describe("dueForKick", () => {
  it("allows one kick per window", () => {
    expect(dueForKick(undefined, 100, 50)).toBe(true);
    expect(dueForKick(80, 100, 50)).toBe(false);
    expect(dueForKick(50, 100, 50)).toBe(true);
  });
});
