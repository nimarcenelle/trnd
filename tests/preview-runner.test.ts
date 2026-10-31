import { describe, expect, it } from "vitest";

import { stepUntilDone } from "@/lib/preview/steps";

/** Runs the loop against a scripted list of step results; returns what it did, in order. */
async function drive(statuses: (string | null)[], stopAfter = Infinity) {
  const log: string[] = [];
  let steps = 0;
  await stepUntilDone({
    step: async () => {
      steps++;
      log.push(`step:${statuses[steps - 1] ?? "null"}`);
      return statuses[steps - 1] ?? null;
    },
    refresh: () => void log.push("refresh"),
    wait: async () => void log.push("wait"),
    live: () => steps < stopAfter && steps < statuses.length + 5,
  });
  return log;
}

describe("stepUntilDone", () => {
  it("steps straight on while the status moves, and stops on one that isn't working", async () => {
    expect(await drive(["reading", "niche", "idea", "ready"])).toEqual(["step:reading", "refresh", "step:niche", "refresh", "step:idea", "refresh", "step:ready", "refresh"]);
    expect(await drive(["reading", "confirm"])).toEqual(["step:reading", "refresh", "step:confirm", "refresh"]);
    expect(await drive(["error", "reading"])).toEqual(["step:error", "refresh"]);
  });

  it("waits when the status didn't change or the request failed", async () => {
    expect(await drive(["niche", "niche", null, "idea", "ready"])).toEqual([
      "step:niche",
      "refresh",
      "step:niche",
      "refresh",
      "wait",
      "step:null",
      "refresh",
      "wait",
      "step:idea",
      "refresh",
      "step:ready",
      "refresh",
    ]);
  });

  it("stops without refreshing once the page has gone", async () => {
    expect(await drive(["reading", "niche"], 1)).toEqual(["step:reading"]);
  });
});
