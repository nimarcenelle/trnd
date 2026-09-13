import { describe, expect, it } from "vitest";

import {
  FOUNDING_PRICE,
  FOUNDING_PRICE_ANNUAL,
  FOUNDING_SEATS,
  GUARANTEE,
  GUARANTEE_DAYS,
  PLAN_PRICES,
  STANDARD_PRICE,
  STANDARD_PRICE_ANNUAL,
} from "../lib/billing";
import { visibleSections, type DetailSection } from "../lib/picks/detail";

const ALL: DetailSection[] = ["finding", "bet", "scripts", "guardrail", "why", "actions"];

/** "$250/mo" and "$2,500/yr" to 250 and 2500. */
function dollars(price: string): number {
  return Number(price.replace(/[^0-9]/g, ""));
}

describe("the wall on a lapsed account", () => {
  it("keeps the finding and holds everything the plan buys", () => {
    const shown = visibleSections(ALL, true);
    expect(shown).toEqual(["finding"]);
    // The bet, the scripts and the evidence are the subscription.
    for (const held of ["bet", "scripts", "guardrail", "why", "actions"]) {
      expect(shown).not.toContain(held);
    }
  });

  it("changes nothing while the plan is current", () => {
    expect(visibleSections(ALL, false)).toEqual(ALL);
  });

  it("holds nothing that was not there to begin with", () => {
    expect(visibleSections(["finding", "bet"], true)).toEqual(["finding"]);
    expect(visibleSections([], true)).toEqual([]);
  });
});

describe("pricing", () => {
  it("the founding rate is the one a new brand is offered", () => {
    expect(PLAN_PRICES.baseline).toBe(FOUNDING_PRICE);
    expect(dollars(FOUNDING_PRICE)).toBeLessThan(dollars(STANDARD_PRICE));
  });

  it("annual is ten months of monthly, the two-months-free the page promises", () => {
    expect(dollars(FOUNDING_PRICE_ANNUAL)).toBe(dollars(FOUNDING_PRICE) * 10);
    expect(dollars(STANDARD_PRICE_ANNUAL)).toBe(dollars(STANDARD_PRICE) * 10);
  });

  it("the cohort is a real cap and the guarantee states its own window", () => {
    expect(FOUNDING_SEATS).toBeGreaterThan(0);
    expect(GUARANTEE).toContain(String(GUARANTEE_DAYS));
  });
});
