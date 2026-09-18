import { describe, expect, it } from "vitest";

import { emptyWeekLine } from "../lib/picks/list";

/** An empty week names the signals that had nothing to read, and where to fix it. */
describe("emptyWeekLine", () => {
  it("says every candidate held and which half of the grade was dark", () => {
    const both = emptyWeekLine({ held: 5, adHistoryRows: 0, competitors: 0, where: "around Atlanta", category: "Health & beauty" });
    expect(both.line).toBe(
      "5 candidates were graded and every one held: no ad results are on file and no competitors are named, so the Brand and Competitive signals had nothing to read and the grade rested on the market alone. The week is graded again on the next daily read once that lands.",
    );
    expect(both.missing.map((m) => m.href)).toEqual(["/app/settings#ads", "/app/settings"]);

    const rivalsOnly = emptyWeekLine({ held: 1, adHistoryRows: 12, competitors: 0, where: "", category: "" });
    expect(rivalsOnly.line).toMatch(/^1 candidate was graded and every one held: no competitors are named/);
    expect(rivalsOnly.missing).toEqual([{ label: "Name your competitors", href: "/app/settings" }]);
  });

  it("stands on the market read when everything was on file, and says when nothing was read at all", () => {
    const full = emptyWeekLine({ held: 3, adHistoryRows: 40, competitors: 4, where: "", category: "" });
    expect(full.line).toBe("3 candidates were graded and every one held. The daily read keeps going; new tests land on Monday.");
    expect(full.missing).toEqual([]);
    const none = emptyWeekLine({ held: 0, adHistoryRows: 40, competitors: 4, where: "across the US", category: "Skincare" });
    expect(none.line).toBe("This week's reads for Skincare across the US did not turn up a candidate. The daily read keeps going; new tests land on Monday.");
  });
});
