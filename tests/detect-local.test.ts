import { describe, expect, it } from "vitest";

import { geoLabel, geoLevel, localityFor, resolveMetro } from "../lib/signals/geo";
import { parseSuggestResponse } from "../lib/signals/adapters/suggest";
import { DELTA_CAP, extractRisingQueries } from "../lib/signals/adapters/trends-related";
import {
  deriveWeatherTriggers,
  FORECAST_DAYS,
  PAST_DAYS,
  type DailyWeather,
} from "../lib/signals/adapters/weather";
import { applyRelevance, scoreOpportunity } from "../lib/scoring";
import type { Signal } from "../lib/db/types";

/* ------------------------------ geo ------------------------------ */

describe("metro resolution", () => {
  it("maps a major city to its DMA geo with coordinates", () => {
    const atl = resolveMetro("Atlanta", "GA");
    expect(atl?.geo).toBe("US-GA-524");
    expect(atl?.lat).toBeCloseTo(33.75, 1);
  });

  it("maps suburbs to their metro", () => {
    expect(resolveMetro("Decatur", "GA")?.geo).toBe("US-GA-524");
    expect(resolveMetro("Fort Worth", "TX")?.geo).toBe("US-TX-623");
  });

  it("refuses a same-named city in the wrong state", () => {
    // Portland ME must not become Portland OR's metro.
    expect(resolveMetro("Portland", "ME")).toBeNull();
    expect(resolveMetro("Portland", "OR")?.geo).toBe("US-OR-820");
  });

  it("returns null for unmapped towns (state-level fallback)", () => {
    expect(resolveMetro("Ellijay", "GA")).toBeNull();
  });

  it("classifies and labels geo strings", () => {
    expect(geoLevel("US-GA-524")).toBe("metro");
    expect(geoLevel("US-GA")).toBe("state");
    expect(geoLevel("US")).toBe("national");
    expect(geoLabel("US-GA-524")).toBe("Atlanta metro");
    expect(geoLabel("US-GA")).toBe("Georgia");
    expect(geoLabel("US")).toBe("United States");
  });

  it("judges locality relative to the business", () => {
    expect(localityFor("US-GA-524", "GA")).toBe("metro");
    expect(localityFor("US-GA", "GA")).toBe("state");
    expect(localityFor("US", "GA")).toBe("national");
    expect(localityFor("US-TX-623", "GA")).toBe("national"); // someone else's metro
  });
});

/* ------------------------------ weather ------------------------------ */

function flatWeather(over: Partial<Record<"tmax" | "tmin" | "precip", number[]>> = {}): DailyWeather {
  const n = PAST_DAYS + FORECAST_DAYS;
  return {
    time: Array.from({ length: n }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`),
    tmax: over.tmax ?? Array(n).fill(22),
    tmin: over.tmin ?? Array(n).fill(12),
    precip: over.precip ?? Array(n).fill(0),
  };
}

describe("weather triggers", () => {
  const cats = new Set(["Home services", "Auto services", "Restaurants & cafés", "Fitness studios"]);

  it("fires a first-heat-wave trigger only when the past was mild", () => {
    const tmax = [...Array(PAST_DAYS).fill(24), ...Array(FORECAST_DAYS).fill(33)];
    const triggers = deriveWeatherTriggers(flatWeather({ tmax }), cats);
    const kinds = triggers.map((t) => t.kind);
    expect(kinds).toContain("heat_wave");
    const hvac = triggers.find((t) => t.category === "Home services" && t.kind === "heat_wave");
    expect(hvac?.term).toContain("ac tune up");
    expect(hvac?.detail).toMatch(/°F/);
  });

  it("does NOT fire heat wave mid-summer (Phoenix rule)", () => {
    const tmax = Array(PAST_DAYS + FORECAST_DAYS).fill(38); // hot before, hot after
    const triggers = deriveWeatherTriggers(flatWeather({ tmax }), cats);
    expect(triggers.every((t) => t.kind !== "heat_wave")).toBe(true);
  });

  it("fires first freeze for heating and tires", () => {
    const tmin = [...Array(PAST_DAYS).fill(8), ...Array(FORECAST_DAYS).fill(-2)];
    const triggers = deriveWeatherTriggers(flatWeather({ tmin }), cats);
    expect(triggers.some((t) => t.kind === "cold_snap" && t.category === "Auto services")).toBe(true);
  });

  it("fires a patio window after a washed-out week", () => {
    const precip = [...Array(PAST_DAYS).fill(8), ...Array(FORECAST_DAYS).fill(0)];
    const tmax = Array(PAST_DAYS + FORECAST_DAYS).fill(24);
    const triggers = deriveWeatherTriggers(flatWeather({ precip, tmax }), cats);
    expect(triggers.some((t) => t.kind === "patio_window" && t.category === "Restaurants & cafés")).toBe(true);
    // the same soaked-then-dry shape is the car-wash rebound
    expect(triggers.some((t) => t.kind === "dry_window" && t.category === "Auto services")).toBe(true);
  });

  it("fires a rain streak for gutters and indoor classes", () => {
    const precip = [...Array(PAST_DAYS).fill(0), 6, 7, 9, 0, 0, 0, 0];
    const triggers = deriveWeatherTriggers(flatWeather({ precip }), cats);
    expect(triggers.some((t) => t.kind === "rain_streak" && t.category === "Home services")).toBe(true);
  });

  it("stays silent in unremarkable weather and filters absent categories", () => {
    expect(deriveWeatherTriggers(flatWeather(), cats)).toHaveLength(0);
    const tmax = [...Array(PAST_DAYS).fill(24), ...Array(FORECAST_DAYS).fill(33)];
    const onlyDental = deriveWeatherTriggers(flatWeather({ tmax }), new Set(["Dental & wellness"]));
    expect(onlyDental).toHaveLength(0);
  });
});

/* ------------------------------ suggest ------------------------------ */

describe("autocomplete parsing", () => {
  it("counts intent modifiers and extracts real discoveries", () => {
    const body = JSON.stringify([
      "skin barrier repair",
      [
        "skin barrier repair near me",
        "skin barrier repair cost",
        "skin barrier repair before wedding routine",
        "skin barrier repair",
      ],
    ]);
    const read = parseSuggestResponse("skin barrier repair", body);
    expect(read.intentCount).toBe(2);
    expect(read.discoveries).toEqual(["skin barrier repair before wedding routine"]);
  });

  it("survives malformed responses", () => {
    const read = parseSuggestResponse("x", "<html>rate limited</html>");
    expect(read.suggestions).toHaveLength(0);
    expect(read.intentCount).toBe(0);
  });
});

/* ------------------------------ related queries ------------------------------ */

describe("rising related queries", () => {
  it("reads the rising list and caps Breakout values", () => {
    const rising = extractRisingQueries({
      default: {
        rankedList: [
          { rankedKeyword: [{ query: "top steady query", value: 100 }] },
          {
            rankedKeyword: [
              { query: "glass skin facial atlanta", value: 250, formattedValue: "+250%" },
              { query: "korean facial near me", value: 5000, formattedValue: "Breakout" },
              { query: "", value: 90 },
            ],
          },
        ],
      },
    });
    expect(rising).toHaveLength(2);
    expect(rising[0].delta).toBe(250);
    expect(rising[1].delta).toBe(DELTA_CAP);
    expect(rising[1].formatted).toBe("Breakout");
  });
});

/* ------------------------------ locality scoring ------------------------------ */

describe("locality-aware scoring", () => {
  const signal = (geo: string): Signal => ({
    id: "s1",
    source: "google_trends",
    term: "facial balancing",
    normalized_term: "facial_balancing",
    category: "Health & beauty",
    geo,
    metric_type: "search_interest",
    value: 70,
    delta_pct: 30,
    window_days: 7,
    captured_at: new Date().toISOString(),
    raw: null,
  });

  it("metro-measured demand outranks the same demand measured nationally", () => {
    const national = scoreOpportunity(signal("US"), [], [], { coverageCount: null }, { locality: "national" });
    const state = scoreOpportunity(signal("US-GA"), [], [], { coverageCount: null }, { locality: "state" });
    const metro = scoreOpportunity(signal("US-GA-524"), [], [], { coverageCount: null }, { locality: "metro" });
    expect(metro.score).toBeGreaterThan(state.score);
    expect(state.score).toBeGreaterThan(national.score);
    expect(metro.score - national.score).toBeCloseTo(0.5, 1);
    expect(metro.rationale).toContain("measured in your metro");
  });

  it("the locality bonus survives the relevance gate", () => {
    const metro = scoreOpportunity(signal("US-GA-524"), [], [], { coverageCount: null }, { locality: "metro" });
    const national = scoreOpportunity(signal("US"), [], [], { coverageCount: null }, { locality: "national" });
    const gatedMetro = applyRelevance(metro, 0.6, "same lane", "Fit read");
    const gatedNational = applyRelevance(national, 0.6, "same lane", "Fit read");
    expect(gatedMetro.score).toBeGreaterThan(gatedNational.score);
  });
});
