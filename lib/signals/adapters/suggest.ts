import { CircuitBreaker, fetchText } from "../http";
import type { AdapterFetchInput, RawSignal, SignalAdapter } from "../types";

/**
 * Google Autocomplete — what people are mid-typing right now. Keyless,
 * fast, and very stable (it's the endpoint the search box itself uses).
 *
 * Two reads per watch term:
 * - INTENT: how many suggestions carry buying modifiers ("near me", "cost",
 *   "book") — a live proxy for how transactional the demand is.
 * - DISCOVERY: suggestions that extend the term meaningfully become
 *   candidate terms of their own ("skin barrier repair" → "skin barrier
 *   repair before wedding").
 */

const SUGGEST_URL = "https://suggestqueries.google.com/complete/search";
const MAX_TERMS_PER_RUN = 20;
const MAX_DISCOVERIES_PER_TERM = 2;

const INTENT_RE =
  /\b(near me|cost|price|prices|deals?|best|book|booking|appointment|open now|same day|reviews?)\b/i;

export interface SuggestRead {
  term: string;
  suggestions: string[];
  intentCount: number;
  discoveries: string[];
}

/** The firefox client returns plain JSON: [query, [suggestions...]]. */
export function parseSuggestResponse(term: string, text: string): SuggestRead {
  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
      suggestions = (parsed[1] as unknown[]).filter((s): s is string => typeof s === "string");
    }
  } catch {
    /* malformed — treat as empty */
  }
  const lowerTerm = term.toLowerCase();
  const intentCount = suggestions.filter((s) => INTENT_RE.test(s)).length;
  // A discovery extends the watched term by 2+ real words and isn't just an
  // intent modifier — that's a new demand phrasing worth watching.
  const discoveries = suggestions
    .filter((s) => {
      const lower = s.toLowerCase();
      if (!lower.includes(lowerTerm) || lower === lowerTerm) return false;
      const extra = lower.replace(lowerTerm, "").trim();
      return extra.split(/\s+/).filter((w) => w.length > 1).length >= 2 && !INTENT_RE.test(extra);
    })
    .slice(0, MAX_DISCOVERIES_PER_TERM);
  return { term, suggestions, intentCount, discoveries };
}

export function createSuggestAdapter(): SignalAdapter {
  const breaker = new CircuitBreaker("google_suggest", 3);
  return {
    name: "google_suggest",
    async isAvailable() {
      return !breaker.isOpen;
    },
    async fetch({ watch }: AdapterFetchInput): Promise<RawSignal[]> {
      const out: RawSignal[] = [];
      for (const { term, category, geo } of watch.slice(0, MAX_TERMS_PER_RUN)) {
        if (breaker.isOpen) break;
        try {
          const text = await fetchText(
            `${SUGGEST_URL}?client=firefox&hl=en&gl=us&q=${encodeURIComponent(term)}`,
            { breaker },
          );
          const read = parseSuggestResponse(term, text);
          if (read.intentCount > 0) {
            out.push({
              source: "google_suggest",
              term,
              category,
              geo: geo ?? "US",
              metric_type: "search_intent",
              value: read.intentCount,
              delta_pct: null,
              window_days: 1,
              raw: { suggestions: read.suggestions.slice(0, 10) },
            });
          }
          for (const d of read.discoveries) {
            out.push({
              source: "google_suggest",
              term: d,
              category,
              geo: geo ?? "US",
              metric_type: "search_intent",
              value: null,
              delta_pct: null,
              window_days: 1,
              raw: { discovered_from: term },
            });
          }
        } catch (err) {
          console.warn(`[signals:suggest] "${term}" failed:`, (err as Error).message);
        }
      }
      return out;
    },
  };
}
