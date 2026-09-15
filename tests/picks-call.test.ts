import { describe, expect, it } from "vitest";

import type { PickEvidence } from "../lib/db/types";
import { buildCall } from "../lib/picks/detail";

const ev = (signal: PickEvidence["signal"], claim: string, position = 0, url: string | null = null, label: string | null = null): PickEvidence => ({
  id: `${signal}-${position}`,
  pick_id: "p",
  signal,
  claim,
  source_url: url,
  source_label: label,
  position,
});

describe("the call", () => {
  it("puts a verb in front of the bet and a week behind it, rival proof first", () => {
    const call = buildCall({ term: "dark spots after acne", bet_what: "The vitamin C serum to women 25 to 40, on TikTok and Reels." }, [
      ev("customer", 'Your target customer says it as "dark spots after acne".', 1),
      ev("customer", 'Searches for "dark spots after acne" are up across the US.', 0, "https://trends.google.com/x", "Google Trends"),
      ev("culture", "TikTok creators are posting about it this week.", 0),
      ev("competitive", 'Glow Recipe is running a Meta ad on this: "Fade the spot, keep the glow".', 0, "https://www.facebook.com/ads/library/?id=1", "Meta Ad Library"),
      ev("brand", "Your ads built on customer proof ran 20% above your account average across 6 ads.", 0),
    ]);
    expect(call.sentence).toBe("Run the vitamin C serum to women 25 to 40, on TikTok and Reels this week.");
    expect(call.proofs.map((p) => p.signal)).toEqual(["competitive", "customer", "brand"]);
    expect(call.proofs[0]).toMatchObject({ href: "https://www.facebook.com/ads/library/?id=1", sourceLabel: "Meta Ad Library" });
    expect(call.proofs[1].claim).toMatch(/^Searches/);
  });

  it("does not say the week twice, and has a sentence even with nothing else", () => {
    expect(buildCall({ term: "hard water", bet_what: "the shower filter to renters on Reels this week" }, []).sentence).toBe(
      "Run the shower filter to renters on Reels this week.",
    );
    expect(buildCall({ term: "hard water", bet_what: "  " }, []).sentence).toBe('Run an ad on "hard water" this week.');
    expect(buildCall({ term: "espresso martini", bet_what: "Run Instagram Reels pitching the $15 Sprotini as a quiet evening drink." }, []).sentence).toBe(
      "Run Instagram Reels pitching the $15 Sprotini as a quiet evening drink this week.",
    );
    expect(buildCall({ term: "x", bet_what: "Test the filter to renters on Reels" }, []).sentence).toBe("Run the filter to renters on Reels this week.");
  });
});

describe("one verb on the call", () => {
  it("drops the writer's own opening verb, whatever it is", async () => {
    const { buildCall } = await import("../lib/picks/detail");
    const call = buildCall({ bet_what: "Pitch The Dry Shampoo at $28 on TikTok as the powder that extends wash day without the itch.", term: "dry shampoo itchy scalp" } as never, []);
    expect(call.sentence).toBe("Run the Dry Shampoo at $28 on TikTok as the powder that extends wash day without the itch this week.");
  });
});
