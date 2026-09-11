import { describe, expect, it } from "vitest";

import { serviceForMoment, upcomingMoments } from "../lib/recommend/seasonal";
import type { Service } from "../lib/db/types";

const service = (name: string, active = true): Service => ({
  id: name,
  business_id: "b1",
  name,
  description: null,
  price_cents: 9500,
  is_active: active,
});

const moment = { label: "New Year whitening", month: 1, day: 10, leadWeeks: 2, advice: "Resolution energy favors visible, fast wins." };

describe("moment → the service it's actually about", () => {
  it("names their own menu item when the moment is about one", () => {
    const match = serviceForMoment(moment, [service("Teeth Whitening"), service("Invisalign")]);
    expect(match?.name).toBe("Teeth Whitening");
  });

  it("says nothing rather than attaching the wrong service", () => {
    expect(serviceForMoment(moment, [service("Invisalign"), service("Cleaning")])).toBeNull();
  });

  it("never matches a service the owner turned off", () => {
    expect(serviceForMoment(moment, [service("Teeth Whitening", false)])).toBeNull();
  });

  it("prefers the service with the strongest overlap", () => {
    const patio = { label: "Patio season opens", month: 4, day: 15, leadWeeks: 2, advice: "First warm week fills patios — announce yours first." };
    const match = serviceForMoment(patio, [service("Patio Brunch Seating"), service("Brunch")]);
    expect(match?.name).toBe("Patio Brunch Seating");
  });

  it("has something to say in every month, not just the busy ones", () => {
    // The calendar is deterministic and needs nothing but a category — which
    // is why day one can show it before any signal has landed. A ten-week
    // horizon left real gaps: a med spa signing up in September saw an empty
    // panel, because its next moment sits 85 days out.
    const september = upcomingMoments("Health & beauty", new Date("2026-09-11T00:00:00Z"));
    expect(september.length).toBeGreaterThan(0);
    expect(september[0].label).toBe("Holiday party glow");
    expect(september[0].prepNow).toBe(false);

    for (const category of ["Restaurants & cafés", "Home services", "Fitness studios", "Auto services"]) {
      for (const month of [1, 3, 6, 9, 11]) {
        const moments = upcomingMoments(category, new Date(Date.UTC(2026, month - 1, 15)));
        expect(moments.length, `${category} in month ${month}`).toBeGreaterThan(0);
        expect(moments[0].daysOut).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
