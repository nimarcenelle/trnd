import { describe, expect, it } from "vitest";

import type { BrandPick, PickScript } from "../lib/db/types";
import { formatBet, formatMetric, formatUsd, pickToText, scriptToText } from "../lib/picks/format";

const pick = (over: Partial<BrandPick> = {}): BrandPick => ({
  id: "p1",
  business_id: "b1",
  opportunity_id: null,
  week_of: "2026-09-14",
  rank: 1,
  geo: "US",
  term: "hard water",
  finding: 'Your customers are searching "hard water." Your product page says "Wall Mount Filtered Showerhead."',
  metric_label: 'Searches for "hard water"',
  metric_value: 40500,
  metric_delta_pct: 48.6,
  metric_window: "week",
  sparkline: [],
  bet_what: "The hard-water problem-first video on Reels",
  bet_budget_usd: 1500,
  bet_duration_days: 5,
  bet_kill_rule: "Kill if cost per purchase is 30% over your account average by day 3",
  guardrail: null,
  status: "ready",
  created_at: "2026-09-14T00:00:00Z",
  ...over,
});

const script: PickScript = {
  id: "s1",
  pick_id: "p1",
  position: 0,
  variant_label: "A",
  thesis: "Problem first",
  hook: "Your shower is why your hair feels like straw",
  beats: [
    { visual: "Hand wipes white crust off a showerhead", on_screen_text: "This is on your skin", vo: "" },
    { visual: "Swap to the filter in 20 seconds", on_screen_text: "", vo: "Twist off, twist on." },
  ],
  direction: {
    show: "A real bathroom, the old showerhead still on the wall, then the filter going on by hand in one shot.",
    say: "Name the problem the way the customer does, then say plainly what the filter changes about the water.",
    prove: "What the filter removes, as the product page states it. No results promised.",
  },
  cta: "Shop the filter",
  duration_seconds: 20,
};

describe("a pick's numbers", () => {
  it("says the metric one way everywhere", () => {
    expect(formatMetric(pick())).toEqual({
      label: 'Searches for "hard water"',
      delta: "+49%",
      direction: "up",
      window: "week over week",
      text: "+49% week over week",
    });
    expect(formatMetric(pick({ metric_delta_pct: -12.2, metric_window: "30d" })).text).toBe("-12% over 30 days");
    expect(formatMetric(pick({ metric_delta_pct: null })).direction).toBe("flat");
  });

  it("sizes the bet the way a buyer reads it", () => {
    expect(formatBet(pick())).toBe("$1.5K / 5 days");
    expect(formatBet(pick({ bet_budget_usd: 800, bet_duration_days: 1 }))).toBe("$800 / 1 day");
    expect(formatUsd(12000)).toBe("$12K");
  });
});

describe("copying a pick", () => {
  it("turns a script into plain text a shooter can paste: direction, never lines to read", () => {
    expect(scriptToText(script)).toBe(
      [
        "A: Problem first",
        "Hook: Your shower is why your hair feels like straw",
        "",
        "Show: A real bathroom, the old showerhead still on the wall, then the filter going on by hand in one shot.",
        "Say: Name the problem the way the customer does, then say plainly what the filter changes about the water.",
        "Prove: What the filter removes, as the product page states it. No results promised.",
        "",
        "Close: Shop the filter",
        "Length: about 20s",
      ].join("\n"),
    );
  });

  it("falls back to the shot list on a pick written before direction existed", () => {
    const text = scriptToText({ ...script, direction: null });
    expect(text).toContain("1. Visual: Hand wipes white crust off a showerhead");
    expect(text).toContain("   Voiceover: Twist off, twist on.");
    expect(text).not.toContain("Show:");
  });

  it("copies the whole pick with the metric exactly once and the guardrail only when there is one", () => {
    const text = pickToText({ pick: pick(), scripts: [script, script, script] });
    expect(text.match(/\+49%/g)).toHaveLength(1);
    expect(text).not.toContain("GUARDRAIL");
    expect(text).toContain("SCRIPT 3");
    expect(pickToText({ pick: pick({ guardrail: "No before-and-after skin claims on Meta." }), scripts: [] })).toContain(
      "GUARDRAIL: No before-and-after skin claims on Meta.",
    );
  });
});
