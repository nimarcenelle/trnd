import { describe, expect, it } from "vitest";

import { onboardingFindings } from "../lib/onboarding/findings";
import type { Repo } from "../lib/db/repo";
import type { Business, BusinessBrief, Opportunity, Service, Signal } from "../lib/db/types";

const business = {
  id: "b1",
  name: "Glow Studio",
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  created_at: new Date().toISOString(),
} as Business;

const service = (name: string, cents: number | null): Service => ({
  id: name,
  business_id: "b1",
  name,
  description: null,
  price_cents: cents,
  is_active: true,
});

const signal = (over: Partial<Signal>): Signal =>
  ({
    id: "s1",
    source: "google_trends",
    term: "brow lamination",
    normalized_term: "brow_lamination",
    category: "Health & beauty",
    geo: "US-GA-524",
    metric_type: "search_interest",
    value: 60,
    delta_pct: 34,
    window_days: 7,
    captured_at: new Date().toISOString(),
    raw: null,
    ...over,
  }) as Signal;

/** Only the five reads the findings actually make. */
function repoWith(state: {
  services?: Service[];
  brief?: BusinessBrief | null;
  signals?: Signal[];
  opportunities?: Opportunity[];
}): Repo {
  return {
    listServices: async () => state.services ?? [],
    getBusinessBrief: async () => state.brief ?? null,
    listSignalsForCategory: async () => state.signals ?? [],
    listCompetitorReads: async () => [],
    listOpportunities: async () => state.opportunities ?? [],
  } as unknown as Repo;
}

describe("onboarding findings", () => {
  it("says nothing has landed when nothing has", async () => {
    const findings = await onboardingFindings(repoWith({}), business);
    expect(findings.every((f) => !f.done)).toBe(true);
    // The first unfinished step is what the screen narrates.
    expect(findings[0].pending).toMatch(/Reading your services/);
  });

  it("reports what actually landed, in the owner's own numbers", async () => {
    const findings = await onboardingFindings(
      repoWith({
        services: [service("Brow Lamination", 9500), service("Hydrafacial", 18000)],
        brief: { watch_terms: ["brow lamination", "hydrafacial"] } as BusinessBrief,
        signals: [signal({ delta_pct: 34 })],
      }),
      business,
    );
    const by = (key: string) => findings.find((f) => f.key === key)!;

    expect(by("services").done).toBe(true);
    expect(by("services").headline).toMatch(/2 services — 2 with prices/);
    // The priciest item leads, because that's what an ad can carry.
    expect(by("services").detail).toMatch(/Hydrafacial at \$180/);

    expect(by("brief").headline).toMatch(/2 phrases/);
    expect(by("brief").detail).toMatch(/Atlanta/);

    expect(by("demand").done).toBe(true);
    expect(by("demand").headline).toMatch(/"Brow Lamination" is up 34%/);
    expect(by("demand").headline).toMatch(/Atlanta/);

    // Nothing ranked yet — that step is still the one in flight.
    expect(by("ranking").done).toBe(false);
  });

  it("counts rival ads as competition, never as demand", async () => {
    const findings = await onboardingFindings(
      repoWith({
        brief: { watch_terms: ["brow lamination"] } as BusinessBrief,
        signals: [
          signal({ metric_type: "ad_saturation", source: "meta_ads", value: 3, delta_pct: null }),
        ],
      }),
      business,
    );
    const demand = findings.find((f) => f.key === "demand")!;
    const competition = findings.find((f) => f.key === "competition")!;
    expect(demand.done).toBe(false);
    expect(competition.done).toBe(true);
    expect(competition.headline).toMatch(/3 competitor ads/);
  });

  it("ignores signals that aren't on this business's watchlist", async () => {
    const findings = await onboardingFindings(
      repoWith({
        brief: { watch_terms: ["brow lamination"] } as BusinessBrief,
        signals: [signal({ term: "espresso martini", normalized_term: "espresso_martini" })],
      }),
      business,
    );
    expect(findings.find((f) => f.key === "demand")!.done).toBe(false);
  });
});
