import type { SignalSource } from "@/lib/db/types";

/** What an adapter returns before normalization/dedupe. */
export interface RawSignal {
  source: SignalSource;
  term: string;
  category: string;
  geo: string;
  metric_type: string;
  value: number | null;
  delta_pct: number | null;
  window_days: number;
  raw: unknown;
}

/** A 30-day interest series an adapter may also produce (trends IoT). */
export interface RawSeriesPoint {
  term: string;
  geo: string;
  day: string; // yyyy-mm-dd
  value: number;
}

export interface WatchTerm {
  term: string;
  category: string;
  /** Optional finer geo (e.g. "US-NC") — business terms watch the business's
   * own state; stock category terms stay national. */
  geo?: string;
}

/** A place with businesses in it — the weather adapter's unit of work. */
export interface WatchPlace {
  city: string;
  region: string | null;
  /** Metro geo when resolvable, else state geo. */
  geo: string;
  lat: number | null;
  lng: number | null;
  /** Categories with at least one business in this place. */
  categories: string[];
}

/** A community to read, tagged with the category its signals file under. */
export interface WatchSubreddit {
  name: string;
  category: string;
}

export interface AdapterFetchInput {
  terms: string[];
  /** Category-tagged watchlist: stock per-category terms plus every
   * business's snapshot-generated watch_terms. */
  watch: WatchTerm[];
  /** Deduped business locations, metro-resolved where possible. */
  places?: WatchPlace[];
  /** Stock per-category subreddits plus every business's snapshot-named
   * communities. Adapters that read Reddit use this over the stock list. */
  subreddits?: WatchSubreddit[];
  geo: string;
  windowDays: number;
}

export interface SignalAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  fetch(input: AdapterFetchInput): Promise<RawSignal[]>;
  /** Optional richer output for adapters that also produce series. */
  fetchSeries?(input: AdapterFetchInput): Promise<RawSeriesPoint[]>;
}

export interface AdapterRunReport {
  adapter: string;
  ok: boolean;
  signals: number;
  seriesPoints: number;
  skipped?: string;
  error?: string;
}
