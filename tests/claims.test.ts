import { describe, expect, it } from "vitest";

import {
  buildClaimFacts,
  extractNumericClaims,
  findUnsupportedClaims,
} from "../lib/ai/claims";
import type { Business, Opportunity, Service, Signal } from "../lib/db/types";

const business = {
  id: "b1",
  name: "Ebb & Flow Contrast Therapy",
  category: "Fitness studios",
  city: "New York",
  region: "NY",
  radius_miles: 5,
  price_band: "$$$",
  brand_voice_notes: null,
} as unknown as Business;

const services = [
  { id: "s1", name: "Contrast Therapy Session", price_cents: 6500, is_active: true },
  { id: "s2", name: "Cold Plunge Drop-In", price_cents: 4000, is_active: true },
  { id: "s3", name: "50° Plunge Party (private)", price_cents: null, is_active: true },
] as unknown as Service[];

const signal = { term: "iv hydration therapy", delta_pct: 43.2 } as unknown as Signal;
const opportunity = { score: 7.4 } as unknown as Opportunity;

const facts = () => buildClaimFacts({ business, services, signal, opportunity });

describe("extractNumericClaims", () => {
  it("finds temperatures in every phrasing", () => {
    const claims = extractNumericClaims("a 50-degree plunge at 50° or 50 degrees");
    expect(claims.filter((c) => c.kind === "temperature").map((c) => c.value)).toEqual([50, 50, 50]);
  });

  it("finds durations, percents, money, and history claims", () => {
    const claims = extractNumericClaims(
      "45-minute session, results in 45 minutes, up 43 percent, just $65 or 40 dollars, serving NYC since 2015",
    );
    const kinds = claims.map((c) => c.kind);
    expect(kinds).toContain("duration");
    expect(kinds).toContain("percent");
    expect(kinds).toContain("money");
    expect(kinds).toContain("year");
  });

  it("ignores bare numbers that claim nothing", () => {
    expect(extractNumericClaims("our 3 favorite ways to recover, top 10 list")).toEqual([]);
  });
});

describe("findUnsupportedClaims", () => {
  it("passes copy whose numbers all trace to owner facts", () => {
    const texts = [
      "One Contrast Therapy Session for $65.",
      "Cold plunge drop-ins are $40 within 5 miles.",
      "Searches are up 43% this week.",
    ];
    expect(findUnsupportedClaims(texts, facts())).toEqual([]);
  });

  it("flags invented measurements about the business", () => {
    const texts = [
      "Force your circulation in our 38-degree cold plunge.",
      "Clear New York fatigue in 45 minutes.",
      "Serving the city since 2019.",
    ];
    const flagged = findUnsupportedClaims(texts, facts());
    expect(flagged.map((c) => c.kind).sort()).toEqual(["duration", "temperature", "year"]);
  });

  it("allows numbers the owner wrote into a service name", () => {
    // "50° Plunge Party" is the owner's own naming — 50 is a legitimate claim.
    const withOwnerTemp = findUnsupportedClaims(["our signature 50-degree plunge"], facts());
    expect(withOwnerTemp).toEqual([]);
  });

  it("dedupes repeats of the same claim across assets", () => {
    const texts = ["a 38-degree plunge", "that 38-degree shock", "38 degrees of focus"];
    const flagged = findUnsupportedClaims(texts, facts());
    // "38-degree" twice collapses to one; "38 degrees" phrases differently.
    expect(flagged).toHaveLength(2);
  });
});
