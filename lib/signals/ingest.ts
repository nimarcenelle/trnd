import type { Repo } from "@/lib/db/repo";
import type { Business, NewSignal } from "@/lib/db/types";

import { targetCustomerOf } from "@/lib/ai/brief";
import { weekOf } from "@/lib/recommend/recommend";

import { createDataForSeoAdapter } from "./adapters/dataforseo";
import { createDataForSeoRelatedAdapter } from "./adapters/dataforseo-related";
import { createGoogleNewsAdapter } from "./adapters/google-news";
import { createGoogleTrendsRssAdapter } from "./adapters/google-trends-rss";
import { createRedditAdapter } from "./adapters/reddit";
import { createSuggestAdapter } from "./adapters/suggest";
import { createInstagramAdapter } from "./adapters/instagram";
import { createTiktokApifyAdapter } from "./adapters/tiktok-apify";
import { createTiktokCcAdapter } from "./adapters/tiktok-cc";
import { createTrendsIotAdapter } from "./adapters/trends-iot";
import { createTrendsRelatedAdapter } from "./adapters/trends-related";
import { createWeatherAdapter } from "./adapters/weather";
import { createXAdapter } from "./adapters/x";
import { createYoutubeAdapter } from "./adapters/youtube";
import { createMetaAdsAdapter } from "./adlibrary";
import { CATEGORY_CONFIGS } from "./category-terms";
import { businessStateGeo, isOnlineBusiness, resolveMetro } from "./geo";
import { normalizeTerm } from "./normalize";
import type { AdapterRunReport, SignalAdapter, WatchPlace, WatchSubreddit } from "./types";

export interface IngestSummary {
  day: string;
  reports: AdapterRunReport[];
  totalSignals: number;
  totalSeriesPoints: number;
}

/** The tokens that make a watch term local — strippable when an adapter has
 * to widen a too-narrow read ("cold plunge nyc" → "cold plunge"). */
export function localityTokens(business: Business): string[] {
  // An online brand's terms carry no place to strip.
  if (isOnlineBusiness(business)) return [];
  return [
    ...business.city.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    ...(business.region ? [business.region.toLowerCase()] : []),
    "nyc",
    "near",
    "me",
    "local",
  ];
}

/**
 * The target customer's own phrases worth measuring as demand. Single words
 * ("latte") are classification vocabulary, not searches anyone's volume can
 * be read on, so only phrases of two words or more are watched.
 */
export function customerWatchPhrases(brief: Parameters<typeof targetCustomerOf>[0], cap = 10): string[] {
  const tc = targetCustomerOf(brief);
  if (!tc) return [];
  return tc.vocabulary
    .map((v) => v.toLowerCase().trim())
    .filter((v) => v.split(/\s+/).length >= 2 && v.length <= 60)
    .slice(0, cap);
}

/** Subreddits the target customer hangs out in ("r/Atlanta", "coffee"). */
export function customerSubreddits(brief: Parameters<typeof targetCustomerOf>[0]): string[] {
  const tc = targetCustomerOf(brief);
  if (!tc) return [];
  return tc.hangouts
    .map((h) => h.trim())
    .filter((h) => /^r\//i.test(h) || /^[A-Za-z0-9_]{3,21}$/.test(h))
    .map((h) => h.replace(/^r\//i, ""));
}

/** Raw adapter output → insert rows (shared by the daily job and the
 * per-business first-day ingest). */
function toSignalRows(raw: Awaited<ReturnType<SignalAdapter["fetch"]>>): NewSignal[] {
  return raw
    .filter((r) => r.term.trim().length > 0)
    .map((r) => ({
      source: r.source,
      term: r.term,
      normalized_term: normalizeTerm(r.term),
      category: r.category || "General",
      geo: r.geo,
      metric_type: r.metric_type,
      value: r.value,
      delta_pct: r.delta_pct,
      window_days: r.window_days,
      raw: r.raw,
    }));
}

/**
 * Day-one demand reads for ONE business: its snapshot watch terms through
 * the targeted adapters (search volume, news coverage, ad library, trends)
 * — so a new business's demand tracker fills in at onboarding instead of
 * waiting for the next daily cron. Idempotent like the daily job.
 */
export interface BusinessIngestResult {
  written: number;
  /** True when the budget ran out with adapters still to run. */
  exhausted: boolean;
}

/** Sources whose per-term reads cost money: a term read today is not read again. */
const PAID_SOURCES: Record<string, string> = { tiktok_apify: "tiktok", youtube: "youtube", x: "x", instagram: "instagram" };
/** A first read fits one job hop; what is left continues on the next. */
export const BUSINESS_INGEST_BUDGET_MS = 200_000;
/**
 * YouTube's free quota is 10,000 units a day for the whole account, and a
 * deep term read is about 200 of them. The daily cron used to be allowed
 * 9,000, so a brand that signed up after 09:00 UTC got one term or none.
 * The cron keeps half; each signup gets a dozen deep reads of its own.
 */
export const CRON_YOUTUBE_UNITS = 5_000;
export const SIGNUP_YOUTUBE_UNITS = 2_500;

/**
 * Which readers a per-business scan runs. The fast tier is the free and
 * quick set (search volume, the Trends line, Google News, TikTok's public
 * board, YouTube's API): enough for an honest first pick in a couple of
 * minutes. The slow tier is the scraped short-form and ad reads that take
 * minutes each; a fresh signup gets them after its first pick, not before.
 */
export type ScanTier = "fast" | "slow" | "all";
export const SLOW_ADAPTERS = new Set(["tiktok_apify", "instagram", "x", "meta_ads"]);
/** A fast first read fits well inside one hop. */
export const FAST_SCAN_BUDGET_MS = 75_000;

export async function runSignalIngestForBusiness(
  repo: Repo,
  business: Business,
  opts: { budgetMs?: number; tier?: ScanTier } = {},
): Promise<BusinessIngestResult> {
  const tier: ScanTier = opts.tier ?? "all";
  const startedAt = Date.now();
  const budgetMs = opts.budgetMs ?? BUSINESS_INGEST_BUDGET_MS;
  const remaining = () => budgetMs - (Date.now() - startedAt);
  const brief = await repo.getBusinessBrief(business.id);
  // Brief v5 watchlists run 18-30 terms; day one reads the strongest dozen,
  // plus the target customer's own phrases — the demand that matters is
  // what THEY type, and a brief's watchlist is the owner-side view of it.
  const seen = new Set<string>();
  const terms = [...(brief?.watch_terms ?? []).slice(0, 12), ...customerWatchPhrases(brief, 6)].filter((t) => {
    const k = t.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (terms.length === 0) return { written: 0, exhausted: false };
  const stateGeo = businessStateGeo(business) ?? "US";
  const locality = localityTokens(business);
  const watch = terms.map((t) => ({
    term: t.toLowerCase().trim(),
    category: business.category,
    geo: stateGeo,
    locality,
  }));
  // The customer's own communities, for the Reddit read: the analysis names
  // them and the persona names more. The stock boards are the daily cron's.
  const subreddits: WatchSubreddit[] = [];
  for (const name of [...(brief?.subreddits ?? []).slice(0, 6), ...customerSubreddits(brief).slice(0, 4)]) {
    const key = name.replace(/^r\//i, "").trim();
    if (key && !subreddits.some((s) => s.name.toLowerCase() === key.toLowerCase())) subreddits.push({ name: key, category: business.category });
  }
  // What today already holds, so a hop that resumes a cut-short read pays
  // only for the terms it did not reach.
  const readToday = new Map<string, Set<string>>();
  try {
    for (const row of await repo.listSignalsForCategory(business.category, { sinceDays: 1 })) {
      const set = readToday.get(row.source) ?? new Set<string>();
      set.add(row.term.toLowerCase().trim());
      readToday.set(row.source, set);
    }
  } catch {
    /* an unreadable pool only costs a repeated read */
  }
  // Whether the category's related phrases were already read today: that
  // read is one paid task per category, and a hop that resumes a cut-short
  // scan must not buy it twice.
  let relatedReadToday = false;
  try {
    relatedReadToday = (await repo.listSignalsForCategory(business.category, { sinceDays: 1 })).some(
      (row) => row.source === "dataforseo" && Boolean((row.raw as { related?: unknown } | null)?.related),
    );
  } catch {
    /* an unreadable pool only costs a repeated read */
  }
  const adapters: SignalAdapter[] = [
    // Search volume first, for the same reason as the daily run: it anchors
    // the Trends index, so without it the demand score has a shape and no
    // size on day one. The category around the brand's terms comes with it,
    // then short-form: what a shop can act on this week is what people are
    // watching. Autocomplete is the cheapest customer language there is and
    // used to wait for the daily cron.
    createDataForSeoAdapter(),
    ...(relatedReadToday ? [] : [createDataForSeoRelatedAdapter()]),
    createSuggestAdapter(),
    createRedditAdapter(),
    createYoutubeAdapter({ unitBudget: SIGNUP_YOUTUBE_UNITS }),
    createTiktokApifyAdapter(),
    createTiktokCcAdapter(),
    createInstagramAdapter(),
    createXAdapter(),
    createGoogleNewsAdapter(),
    createMetaAdsAdapter(),
    createTrendsIotAdapter(),
  ].filter((a) => tier === "all" || (tier === "slow") === SLOW_ADAPTERS.has(a.name));
  // Every source at once: they are independent reads of different services,
  // and one after another they ran past any function's limit. Each gets the
  // whole remaining budget; one that outlives it is picked up next hop.
  let written = 0;
  let exhausted = false;
  const runOne = async (adapter: SignalAdapter): Promise<void> => {
    try {
      if (!(await adapter.isAvailable())) return;
      const source = PAID_SOURCES[adapter.name];
      const done = source ? readToday.get(source) : undefined;
      const todo = done ? watch.filter((w) => !done.has(w.term)) : watch;
      if (todo.length === 0) return;
      const raw = await withTimeout(adapter.fetch({ terms: [], watch: todo, subreddits, geo: "US", windowDays: 7 }), remaining());
      written += await repo.upsertSignals(toSignalRows(raw));
      if (adapter.fetchSeries) {
        const series = await adapter.fetchSeries({ terms: [], watch: todo, subreddits, geo: "US", windowDays: 7 });
        await repo.upsertSeriesPoints(
          series.map((p) => ({
            normalized_term: normalizeTerm(p.term),
            geo: p.geo,
            day: p.day,
            value: p.value,
          })),
        );
      }
    } catch (err) {
      const message = (err as Error).message;
      // A read that outlived the budget is picked up by the next hop; the
      // terms it did reach were stored as the adapter went.
      if (message === "timed out") exhausted = true;
      console.warn(`[ingest:business] adapter ${adapter.name} failed:`, message);
    }
  };
  await Promise.all(adapters.map(runOne));
  return { written, exhausted };
}

/** Rejects with "timed out" when the adapter call outlives its slice — the
 * underlying promise is abandoned, not cancelled (fetch keys off its own
 * signal internally; we just stop waiting). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function defaultAdapters(): SignalAdapter[] {
  // Order is priority, not preference: the run has a wall-clock budget and
  // whatever sits at the bottom is what gets skipped on a slow day.
  //
  // Search volume leads, and that is a change. It used to sit sixth, behind
  // the short-form reads, on the reasoning that short-form is the basis of
  // the product. That stopped being the whole story the day the demand
  // score started anchoring the Google Trends index to real volume: Trends
  // is the most abundant signal held and contributes NOTHING without a
  // volume to anchor it, so DataForSEO is now load-bearing for every term
  // rather than one source among several.
  //
  // It also stopped being theoretical. Adding Instagram and X above it, and
  // making the Shorts read twice as expensive per term, pushed it past the
  // budget: it last wrote on 2026-09-10 and went 48 hours without a row
  // while every adapter above it ran. Nothing failed and nothing was
  // logged — it was simply never reached.
  return [
    createDataForSeoAdapter(),
    createDataForSeoRelatedAdapter(),
    // Short-form next: the basis of the ranking, and the reads an owner
    // acts on. YouTube per business term, then per-term TikTok when it is
    // paid for, then the free national board.
    createYoutubeAdapter({ unitBudget: CRON_YOUTUBE_UNITS }),
    createTiktokApifyAdapter(),
    createTiktokCcAdapter(),
    // Reels is where local operators actually post, X is the written half
    // of the conversation. Both key-gated; both skip cleanly when unset.
    createInstagramAdapter(),
    createXAdapter(),
    // Saturation and context.
    createGoogleTrendsRssAdapter(),
    createWeatherAdapter(),
    createSuggestAdapter(),
    createRedditAdapter(),
    createGoogleNewsAdapter(),
    createMetaAdsAdapter(),
    // The fragile unofficial Trends endpoints last, where a failure costs
    // nothing — but note the interest-over-time read is what the anchor
    // above needs, so a run that never reaches it leaves volume unshaped.
    createTrendsIotAdapter(),
    createTrendsRelatedAdapter(),
  ];
}

/**
 * Runs every adapter, tolerating individual failures — the job succeeds with
 * partial results. Everything raw is kept in signals.raw; the daily unique
 * index makes re-runs idempotent (never re-hit a source you already stored
 * today — dupes are dropped at the DB layer).
 */
export async function runIngest(
  repo: Repo,
  opts: {
    geo?: string;
    windowDays?: number;
    adapters?: SignalAdapter[];
    /** Wall-clock cap for the whole run — adapters not yet started when it's
     * spent are skipped, so the cron route answers inside Vercel's 300s
     * maxDuration instead of 504ing (a hung adapter used to eat the rest of
     * the run). */
    budgetMs?: number;
    /** Cap for a single adapter fetch/fetchSeries call. */
    adapterTimeoutMs?: number;
  } = {},
): Promise<IngestSummary> {
  const startedAt = Date.now();
  const geo = opts.geo ?? "US";
  const windowDays = opts.windowDays ?? 7;
  const adapters = opts.adapters ?? defaultAdapters();
  const budgetMs = opts.budgetMs ?? 240_000;
  const adapterTimeoutMs = opts.adapterTimeoutMs ?? 60_000;
  // A call's slice never exceeds what's left of the whole-run budget.
  const sliceMs = () =>
    Math.min(adapterTimeoutMs, Math.max(budgetMs - (Date.now() - startedAt), 0));
  const watchTerms = CATEGORY_CONFIGS.flatMap((c) => c.watchTerms.slice(0, 3));

  // The personalized half of the watchlist: every business's snapshot names
  // the search phrases its real customers use. TRND watches what each
  // business sells — not just its category. The snapshot's watchlist is the
  // backbone (up to 24 terms per business, metro-scoped); the category's
  // stock terms are the floor beneath it.
  const seen = new Set<string>();
  const watch: { term: string; category: string; geo?: string; locality?: string[] }[] = [];
  const addWatch = (term: string, category: string, termGeo?: string, locality?: string[]) => {
    const key = term.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    watch.push({ term: key, category, geo: termGeo, locality });
  };
  for (const c of CATEGORY_CONFIGS) for (const t of c.watchTerms.slice(0, 3)) addWatch(t, c.category);
  // Communities: stock per-category lists, widened by each snapshot's own.
  const seenSubs = new Set<string>();
  const subreddits: WatchSubreddit[] = [];
  const addSubreddit = (name: string, category: string) => {
    const key = name.replace(/^r\//i, "").trim();
    if (!key || seenSubs.has(key.toLowerCase())) return;
    seenSubs.add(key.toLowerCase());
    subreddits.push({ name: key, category });
  };
  for (const c of CATEGORY_CONFIGS) for (const s of c.subreddits) addSubreddit(s, c.category);
  const placeMap = new Map<string, WatchPlace>();
  try {
    const week = weekOf();
    for (const b of await repo.listAllBusinesses()) {
      const brief = await repo.getBusinessBrief(b.id);
      // A business's own terms watch its own METRO where the city resolves
      // to one (Google Trends takes DMA geos), its state otherwise — never
      // the whole country. Local demand measured locally is the product.
      // An online brand reads nationally: no metro, no state, no weather.
      const online = isOnlineBusiness(b);
      const metro = online ? null : resolveMetro(b.city, b.region);
      const stateGeo = businessStateGeo(b) ?? "US";
      const bizGeo = metro?.geo ?? stateGeo;
      const locality = localityTokens(b);
      for (const t of (brief?.watch_terms ?? []).slice(0, 24)) addWatch(t, b.category, bizGeo, locality);
      for (const t of customerWatchPhrases(brief)) addWatch(t, b.category, bizGeo, locality);
      for (const s of (brief?.subreddits ?? []).slice(0, 6)) addSubreddit(s, b.category);
      for (const s of customerSubreddits(brief).slice(0, 4)) addSubreddit(s, b.category);
      // This week's ranked terms too — so their saturation read is real.
      for (const o of (await repo.listOpportunities(b.id, week)).slice(0, 5)) {
        const sig = await repo.getSignal(o.signal_id);
        if (sig) addWatch(online || !b.city ? sig.term : `${sig.term} ${b.city}`, b.category, stateGeo);
      }
      // One weather read per place, tagged with every category present there.
      if (online) continue;
      const placeKey = bizGeo;
      const place = placeMap.get(placeKey) ?? {
        city: b.city,
        region: b.region,
        geo: bizGeo,
        lat: metro?.lat ?? null,
        lng: metro?.lng ?? null,
        categories: [],
      };
      if (!place.categories.includes(b.category)) place.categories.push(b.category);
      placeMap.set(placeKey, place);
    }
  } catch (err) {
    console.warn("[ingest] business watchlist unavailable:", (err as Error).message);
  }
  const places = [...placeMap.values()];

  const reports: AdapterRunReport[] = [];
  let totalSignals = 0;
  let totalSeriesPoints = 0;
  // A read that outlived the remainder of the budget spent it. Said here
  // rather than left to the clock: a timer set for what was left can fire
  // while Date.now still reads a millisecond short, and the next adapter
  // would run on a budget that was gone.
  let budgetSpent = false;

  for (const adapter of adapters) {
    const report: AdapterRunReport = { adapter: adapter.name, ok: false, signals: 0, seriesPoints: 0 };
    if (budgetSpent || Date.now() - startedAt >= budgetMs) {
      // This is how DataForSEO went 48 hours without writing a row: nothing
      // failed, nothing errored, it was just never reached. A skip is a
      // silent outage unless it is said out loud.
      console.warn(
        `[ingest] ${adapter.name} SKIPPED — the ${Math.round(budgetMs / 1000)}s budget was spent before it ran. ` +
          `Everything below it in defaultAdapters() is being starved.`,
      );
      report.skipped = "time budget exhausted";
      report.ok = true;
      reports.push(report);
      continue;
    }
    // Whether the slice handed to this adapter was the budget's remainder
    // rather than the per-adapter cap: then its timeout is the budget's end.
    let cappedByBudget = false;
    try {
      if (!(await adapter.isAvailable())) {
        report.skipped = "unavailable (missing key or open circuit)";
        report.ok = true;
        reports.push(report);
        continue;
      }
      let slice = sliceMs();
      cappedByBudget = slice < adapterTimeoutMs;
      const raw = await withTimeout(
        adapter.fetch({ terms: watchTerms, watch, places, subreddits, geo, windowDays }),
        slice,
      );
      report.signals = await repo.upsertSignals(toSignalRows(raw));
      if (adapter.fetchSeries) {
        slice = sliceMs();
        cappedByBudget = slice < adapterTimeoutMs;
        const series = await withTimeout(
          adapter.fetchSeries({ terms: watchTerms, watch, places, subreddits, geo, windowDays }),
          slice,
        );
        report.seriesPoints = await repo.upsertSeriesPoints(
          series.map((p) => ({
            normalized_term: normalizeTerm(p.term),
            geo: p.geo,
            day: p.day,
            value: p.value,
          })),
        );
      }
      report.ok = true;
      totalSignals += report.signals;
      totalSeriesPoints += report.seriesPoints;
    } catch (err) {
      report.error = (err as Error).message;
      if (report.error === "timed out" && cappedByBudget) budgetSpent = true;
      console.warn(`[ingest] adapter ${adapter.name} failed:`, report.error);
    }
    reports.push(report);
  }

  return {
    day: new Date().toISOString().slice(0, 10),
    reports,
    totalSignals,
    totalSeriesPoints,
  };
}
