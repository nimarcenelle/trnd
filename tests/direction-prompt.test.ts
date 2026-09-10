import { describe, expect, it } from "vitest";

import {
  buildAngleJudgePrompt,
  buildAngleSlatePrompt,
  generateAssetsPrompt,
  type PromptCtx,
} from "../lib/ai/prompts/generate-campaign";
import type { Business, Opportunity, Service, Signal } from "../lib/db/types";

const ctx = (direction: string | null): PromptCtx => ({
  business: {
    id: "b1",
    name: "Glow Room",
    category: "Health & beauty",
    city: "Atlanta",
    region: "GA",
    radius_miles: 12,
    price_band: "$$",
    brand_voice_notes: null,
  } as unknown as Business,
  signal: { term: "korean glass skin facial", metric_type: "conversation", source: "seed", delta_pct: 47 } as unknown as Signal,
  opportunity: { score: 7.4, rationale: "Rising fast.", competitor_gap: null } as unknown as Opportunity,
  service: { id: "s1", name: "Glass skin facial", price_cents: 14000, is_active: true } as unknown as Service,
  services: [
    { id: "s1", name: "Glass skin facial", price_cents: 14000, is_active: true },
    { id: "s2", name: "Brow lamination", price_cents: 8500, is_active: true },
  ] as unknown as Service[],
  brief: null,
  direction,
});

const angles = [
  { angle: "a", hook: "h", offer: "o", audience: { angle_type: "offer" } },
  { angle: "b", hook: "h", offer: "o", audience: { angle_type: "education" } },
  { angle: "c", hook: "h", offer: "o", audience: { angle_type: "scarcity" } },
];

describe("the owner's direction in the campaign prompts", () => {
  it("rides in every call when given, and outranks taste but never the menu", () => {
    const d = "Lead with the brow lamination at $85 for first-time clients.";
    for (const prompt of [
      buildAngleSlatePrompt(ctx(d)),
      buildAngleJudgePrompt(ctx(d), angles),
      generateAssetsPrompt(ctx(d), angles[0]),
    ]) {
      expect(prompt).toContain("THE OWNER'S DIRECTION");
      expect(prompt).toContain(d);
      expect(prompt).toContain("cannot add anything the MENU doesn't list");
    }
    expect(buildAngleSlatePrompt(ctx(d))).toContain("vary the route, not the destination");
    expect(buildAngleJudgePrompt(ctx(d), angles)).toContain("ignores THE OWNER'S DIRECTION above loses");
  });

  it("leaves no trace when there is none", () => {
    for (const prompt of [
      buildAngleSlatePrompt(ctx(null)),
      buildAngleJudgePrompt(ctx(null), angles),
      generateAssetsPrompt(ctx(null), angles[0]),
    ]) {
      expect(prompt).not.toContain("DIRECTION");
    }
  });

  it("collapses whitespace in the direction so a pasted paragraph reads as one line", () => {
    expect(buildAngleSlatePrompt(ctx("Lead   with\n the brows."))).toContain('"Lead with the brows."');
  });
});
