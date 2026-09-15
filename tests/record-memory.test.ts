import { describe, expect, it } from "vitest";

import { buildBrandMemory, lastWin, memoryHold, memoryLines } from "../lib/record/memory";

const now = new Date("2026-09-14T12:00:00Z");
const run = (over: Record<string, unknown>) => ({
  status: "completed" as const,
  started_at: "2026-09-01T00:00:00Z",
  ended_at: "2026-09-06T00:00:00Z",
  spend_usd: null,
  impressions: null,
  clicks: null,
  conversions: null,
  revenue_usd: null,
  ...over,
});

describe("brand memory", () => {
  it("holds a term the brand is running, killed, or passed on, with the reason", () => {
    const memory = buildBrandMemory({
      runs: [
        { run: run({ status: "running", ended_at: null, started_at: "2026-09-12T00:00:00Z" }), pick: { term: "Hard water" } },
        { run: run({ status: "killed", ended_at: "2026-09-02T00:00:00Z" }), pick: { term: "glass skin" } },
        { run: run({ verdict: "lost", ended_at: "2026-09-05T00:00:00Z" }), pick: { term: "brassy hair" } },
      ],
      feedback: [
        { feedback: { action: "dismissed", reason: "off_brand", created_at: "2026-09-08T00:00:00Z" }, pick: { term: "everything shower" } },
        { feedback: { action: "running", reason: null, created_at: "2026-09-12T00:00:00Z" }, pick: { term: "hard water" } },
      ],
    });
    expect(memoryHold(memory.get("hard_water"), now)?.reason).toBe("You're running this now (since Sep 12)");
    expect(memoryHold(memory.get("glass_skin"), now)?.reason).toBe("You stopped this on Sep 2; the topic comes back with a different concept");
    expect(memoryHold(memory.get("brassy_hair"), now)?.reason).toBe(
      "You ran this and it did not win (you called it a loss, ended Sep 5); the topic comes back with a different concept",
    );
    expect(memoryHold(memory.get("everything_shower"), now)?.reason).toBe("You said this is off-brand (Sep 8)");
    expect(memoryHold(memory.get("never_seen"), now)).toBeNull();
  });

  it("lets go after the cool-off, and never holds a winner", () => {
    const memory = buildBrandMemory({
      runs: [
        { run: run({ status: "killed", ended_at: "2026-06-01T00:00:00Z" }), pick: { term: "old loss" } },
        { run: run({ verdict: "won", ended_at: "2026-09-06T00:00:00Z" }), pick: { term: "winner" } },
      ],
      feedback: [{ feedback: { action: "dismissed", reason: "other", created_at: "2026-07-01T00:00:00Z" }, pick: { term: "old pass" } }],
    });
    expect(memoryHold(memory.get("old_loss"), now)).toBeNull();
    expect(memoryHold(memory.get("old_pass"), now)).toBeNull();
    expect(memoryHold(memory.get("winner"), now)).toBeNull();
    expect(lastWin(memory.get("winner"))?.outcome).toBe("won");
  });

  it("writes the record as plain lines for the writer", () => {
    const memory = buildBrandMemory({
      runs: [{ run: run({ spend_usd: 500, revenue_usd: 1200 }), pick: { term: "hard water" } }],
      feedback: [{ feedback: { action: "dismissed", reason: "already_tried", created_at: "2026-08-20T00:00:00Z" }, pick: { term: "hard water" } }],
    });
    expect(memoryLines(memory.get("hard_water"))).toEqual([
      'The brand ran an ad on "hard water" Sep 1 to Sep 6: it won (ROAS 2.4x).',
      "You said you already tried this (Aug 20).",
    ]);
    expect(memoryLines(undefined)).toEqual([]);
  });
});
