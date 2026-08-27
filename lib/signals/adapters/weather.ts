import { CircuitBreaker, fetchJson } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

/**
 * Weather-driven demand triggers — the most local, most predictive signal in
 * the stack, and completely free (Open-Meteo, no key, generous limits).
 *
 * Weather IS local demand for half our categories: the first heat wave sells
 * AC tune-ups, the first freeze sells heating checks and tire swaps, a clear
 * warm window fills patios and run clubs, a rain streak fills gutters. The
 * static seasonal calendar (lib/recommend/seasonal.ts) knows the average
 * year; this adapter reads the ACTUAL next seven days for each business's
 * metro and fires only when the forecast crosses a threshold the recent past
 * didn't — deterministic, explainable, and timed to the week it matters.
 *
 * Deltas here are heuristic demand-pressure estimates (flagged in raw), not
 * measured percentages — the rationale layer says so in plain English.
 */

export const PAST_DAYS = 14;
export const FORECAST_DAYS = 7;

export interface DailyWeather {
  /** yyyy-mm-dd, oldest first; index PAST_DAYS = today. */
  time: string[];
  /** °C */
  tmax: number[];
  tmin: number[];
  /** mm */
  precip: number[];
}

export interface WeatherTrigger {
  kind: "heat_wave" | "cold_snap" | "patio_window" | "rain_streak" | "dry_window";
  /** The demand phrase — written to match category concepts and services. */
  term: string;
  category: string;
  /** Heuristic demand pressure, rendered like a delta. */
  delta_pct: number;
  /** Peak reading behind the trigger (°C or mm). */
  value: number;
  /** One plain-English sentence for the rationale/insight layer. */
  detail: string;
}

const C_TO_F = (c: number) => Math.round((c * 9) / 5 + 32);

/** Which categories care about which trigger, and how the demand is phrased. */
const TRIGGER_TERMS: Record<WeatherTrigger["kind"], { category: string; term: string }[]> = {
  heat_wave: [
    { category: "Home services", term: "ac tune up before the heat" },
    { category: "Auto services", term: "car ac recharge" },
    { category: "Restaurants & cafés", term: "iced drinks hot week" },
  ],
  cold_snap: [
    { category: "Home services", term: "heating tune up before the freeze" },
    { category: "Auto services", term: "winter tire swap" },
  ],
  patio_window: [
    { category: "Restaurants & cafés", term: "patio dining weather" },
    { category: "Fitness studios", term: "outdoor run club weather" },
  ],
  rain_streak: [
    { category: "Home services", term: "gutter and drainage check" },
    { category: "Fitness studios", term: "indoor class week" },
  ],
  dry_window: [{ category: "Auto services", term: "car wash and detail window" }],
};

/**
 * Pure trigger derivation over 21 days of daily data (14 past + 7 forecast).
 * Every rule is "forecast crosses a line the recent past didn't" — a heat
 * wave in week 30 of an Arizona summer is not news and does not fire.
 */
export function deriveWeatherTriggers(daily: DailyWeather, categories: Set<string>): WeatherTrigger[] {
  const past = { tmax: daily.tmax.slice(0, PAST_DAYS), tmin: daily.tmin.slice(0, PAST_DAYS), precip: daily.precip.slice(0, PAST_DAYS) };
  const next = { tmax: daily.tmax.slice(PAST_DAYS), tmin: daily.tmin.slice(PAST_DAYS), precip: daily.precip.slice(PAST_DAYS) };
  if (next.tmax.length === 0 || past.tmax.length < 7) return [];

  const out: Omit<WeatherTrigger, "category" | "term">[] = [];
  const max = (xs: number[]) => Math.max(...xs);
  const min = (xs: number[]) => Math.min(...xs);

  // First heat wave: ≥31°C (88°F) ahead, when the last two weeks stayed under 29°C.
  if (max(next.tmax) >= 31 && max(past.tmax) < 29) {
    const peak = max(next.tmax);
    out.push({
      kind: "heat_wave",
      delta_pct: 45,
      value: peak,
      detail: `First real heat of the season — ${C_TO_F(peak)}°F forecast this week after two weeks under ${C_TO_F(29)}°F.`,
    });
  }

  // First freeze: ≤0°C ahead, when the last two weeks stayed above 3°C.
  if (min(next.tmin) <= 0 && min(past.tmin) > 3) {
    const low = min(next.tmin);
    out.push({
      kind: "cold_snap",
      delta_pct: 45,
      value: low,
      detail: `First freeze of the season — ${C_TO_F(low)}°F low forecast this week after a mild fortnight.`,
    });
  }

  // Patio window: ≥3 dry, 18–29°C days ahead, when the past week offered <2.
  const patioDay = (tmax: number, precip: number) => tmax >= 18 && tmax <= 29 && precip < 1;
  const patioAhead = next.tmax.filter((t, i) => patioDay(t, next.precip[i] ?? 0)).length;
  const patioPastWeek = past.tmax
    .slice(-7)
    .filter((t, i) => patioDay(t, past.precip.slice(-7)[i] ?? 0)).length;
  if (patioAhead >= 3 && patioPastWeek < 2) {
    out.push({
      kind: "patio_window",
      delta_pct: 25,
      value: patioAhead,
      detail: `${patioAhead} clear, mild days forecast this week after a week that offered almost none.`,
    });
  }

  // Rain streak: 3+ consecutive wet forecast days (≥5mm).
  let streak = 0;
  let bestStreak = 0;
  for (const p of next.precip) {
    streak = p >= 5 ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  if (bestStreak >= 3) {
    out.push({
      kind: "rain_streak",
      delta_pct: 20,
      value: bestStreak,
      detail: `${bestStreak} consecutive rainy days forecast — the week people notice what leaks and what's closed.`,
    });
  }

  // Dry window after a soaked week: wash-and-detail demand snaps back.
  const pastWeekRain = past.precip.slice(-7).reduce((s, p) => s + p, 0);
  const nextThreeDry = next.precip.slice(0, 3).every((p) => p < 1);
  if (pastWeekRain >= 20 && nextThreeDry && next.precip.length >= 3) {
    out.push({
      kind: "dry_window",
      delta_pct: 25,
      value: Math.round(pastWeekRain),
      detail: `Dry days ahead after ${Math.round(pastWeekRain)}mm of rain last week — the classic wash-and-detail rebound.`,
    });
  }

  return out.flatMap((t) =>
    TRIGGER_TERMS[t.kind]
      .filter((m) => categories.has(m.category))
      .map((m) => ({ ...t, category: m.category, term: m.term })),
  );
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoResponse {
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

export function createWeatherAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("weather", 3);
  return {
    name: "weather",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ places }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      for (const place of places ?? []) {
        if (breaker.isOpen) break;
        if (place.lat === null || place.lng === null) continue;
        try {
          const url =
            `${FORECAST_URL}?latitude=${place.lat}&longitude=${place.lng}` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
            `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}&timezone=auto`;
          const res = await fetchJson<OpenMeteoResponse>(url, { breaker });
          if (!res.daily) continue;
          const triggers = deriveWeatherTriggers(
            {
              time: res.daily.time,
              tmax: res.daily.temperature_2m_max,
              tmin: res.daily.temperature_2m_min,
              precip: res.daily.precipitation_sum,
            },
            new Set(place.categories),
          );
          for (const t of triggers) {
            out.push({
              source: "weather",
              term: t.term,
              category: t.category,
              geo: place.geo,
              metric_type: "weather_trigger",
              value: t.value,
              delta_pct: t.delta_pct,
              window_days: FORECAST_DAYS,
              raw: { kind: t.kind, detail: t.detail, heuristic_delta: true, city: place.city },
            });
          }
        } catch (err) {
          console.warn(`[signals:weather] ${place.city} failed:`, (err as Error).message);
        }
      }
      return out;
    },
  };
}
