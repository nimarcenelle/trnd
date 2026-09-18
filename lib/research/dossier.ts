import { readAdHistory, type HistoryRead } from "@/lib/ads/history-read";
import type { Repo } from "@/lib/db/repo";
import type {
  AdHistory,
  Business,
  BusinessBrief,
  BusinessDocument,
  Competitor,
  CompetitorRead,
  Review,
  Service,
  Signal,
  SocialComment,
  SocialPlatform,
  SocialPost,
  TargetCustomer,
} from "@/lib/db/types";
import { memoryLines, loadBrandMemory } from "@/lib/record/memory";
import { targetCustomerOf } from "@/lib/ai/brief";
import { competitiveSet } from "@/lib/recommend/four-signals";
import { monthlyVolumes, yearOverYearFromMonthly } from "@/lib/scoring/gather";
import { classifyAdCopy, isRivalAd, type AdTheme } from "@/lib/signals/adlibrary-apify";
import { engagementOf, readAccount, rivalMoves, type AccountRead } from "@/lib/social/read";

/**
 * The research dossier: everything TRND knows about one brand, in one shape,
 * every week.
 *
 * The brief writer used to be handed two to four sentences and six quotes,
 * each chosen by whether it contained the research phrase. A rival running
 * eleven ads about scalp health contributed nothing to a brief on "dry
 * shampoo itchy scalp" because the words did not overlap; a brand with five
 * rivals read got briefs with no competitive line at all. The dossier is
 * the other way round: the whole situation first, unfiltered by any one
 * term, with a coverage section that says what was read and what was not,
 * so the model that reasons over it knows how much to trust each part and
 * two brands with different coverage never get the same confident tone.
 *
 * Everything here is a read of what is already stored. Nothing is fetched,
 * nothing is paid for, and nothing is written. The caps below are about the
 * model's context window, not about a card on a page: they are generous.
 */

export const DOSSIER_VERSION = "dossier-1";

const CAPS = {
  catalog: 120,
  terms: 60,
  categoryPool: 40,
  quotes: 40,
  ownPostsTop: 12,
  ownPostsRecent: 8,
  ownAdsTop: 12,
  ownAdsBottom: 6,
  rivalAds: 30,
  rivalPostsTop: 10,
  documentFacts: 40,
  captionChars: 500,
} as const;

/* --------------------------------- shapes --------------------------------- */

export interface DossierTerm {
  term: string;
  /** Monthly Google searches, US, when DataForSEO read it. */
  monthlyVolume: number | null;
  yoyPct: number | null;
  /** Last 7 days of the index against the 7 before, when a series exists. */
  weekDeltaPct: number | null;
  /** Last 12 months of volume, oldest first, when read. */
  months: { month: string; value: number }[];
  /** Autocomplete completions people type after the term. */
  completions: string[];
  /** Whether the brand's own brief named it, or the category pool found it. */
  origin: "watch" | "category";
  newsMentions30d: number | null;
  shortform: { platform: string; views: number | null; viewsPrev: number | null; medianDurationSec: number | null; top: { title: string; channel: string; views: number; url: string } | null } | null;
}

export interface DossierAd {
  rival: string;
  /** The advertising Page's name as the Ad Library shows it. */
  advertiser: string | null;
  headline: string | null;
  text: string;
  cta: string | null;
  landing: string | null;
  startedOn: string | null;
  runningDays: number | null;
  variants: number | null;
  theme: AdTheme | null;
  url: string | null;
}

export interface DossierPost {
  who: string;
  platform: SocialPlatform;
  caption: string;
  postedAt: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  isAd: boolean;
  kind: string | null;
  url: string;
}

export interface DossierRival {
  name: string;
  website: string | null;
  directness: number | null;
  directnessReason: string | null;
  ads: {
    readOn: string | null;
    active: number | null;
    longestRunningDays: number | null;
    newThisWeek: number | null;
    themes: { theme: string; count: number }[];
    /** Every ad the read stored, longest running first. */
    list: DossierAd[];
  } | null;
  social: Partial<Record<SocialPlatform, { read: AccountRead; top: DossierPost[] }>>;
  moves: string[];
}

export interface DossierCoverage {
  rivalsNamed: number;
  rivalsDirect: number;
  rivalsWithAdsRead: number;
  rivalAdsStored: number;
  ownPosts: number;
  rivalPosts: number;
  ownAdRows: number;
  ownAdSource: string | null;
  comments: number;
  reviews: number;
  documents: number;
  termsWithVolume: number;
  termsWithSeries: number;
  sources: { source: string; rows: number; lastRead: string | null }[];
  /** Plain sentences on what is missing, for the model and the page. */
  missing: string[];
}

export interface Dossier {
  version: typeof DOSSIER_VERSION;
  builtAt: string;
  business: {
    name: string;
    category: string;
    website: string | null;
    market: string;
    monthlyAdSpend: string | null;
    objectives: string[];
    productionFormats: string[];
    claimsNotes: string | null;
    recentCreativeNotes: string | null;
    voiceNotes: string | null;
  };
  brand: {
    catalog: { name: string; price: string | null; description: string | null; inStock: boolean | null }[];
    positioning: string | null;
    segments: string[];
    moat: string | null;
    advantages: string[];
    watchouts: string[];
    pricingRead: string | null;
    seasonality: string | null;
    targetCustomer: TargetCustomer | null;
    documentFacts: { document: string; facts: string[] }[];
  };
  ownPerformance: {
    ads: (HistoryRead & { top: AdHistory[]; source: string | null }) | null;
    social: Partial<Record<SocialPlatform, { read: AccountRead; top: DossierPost[]; recent: DossierPost[] }>>;
    memory: string[];
  };
  customer: {
    terms: DossierTerm[];
    categoryPool: DossierTerm[];
    comments: { where: "yours" | "rival"; rival: string | null; text: string; likes: number; postedAt: string | null }[];
    reviews: { of: "yours" | "rival"; rival: string | null; rating: number; text: string; publishedAt: string | null; source: string }[];
  };
  competitive: {
    rivals: DossierRival[];
    /** Ad themes across every direct rival's active ads. */
    themesAcrossRivals: { theme: string; ads: number; rivals: number }[];
    /** Phrases three words or longer that two or more rivals' ads share. */
    sharedPhrases: { phrase: string; rivals: string[] }[];
  };
  culture: {
    categoryGrowth: { pct: number; basis: string } | null;
  };
  coverage: DossierCoverage;
}

/* --------------------------------- helpers -------------------------------- */

const money = (cents: number | null | undefined): string | null =>
  typeof cents === "number" ? `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}` : null;

const clip = (s: string | null | undefined, n: number = CAPS.captionChars): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const dayOf = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.warn("[dossier] read failed (non-fatal):", (err as Error).message);
    return fallback;
  }
}

function toPost(p: SocialPost, who: string): DossierPost {
  return {
    who,
    platform: p.platform,
    caption: clip(p.caption),
    postedAt: dayOf(p.posted_at),
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    views: p.views,
    isAd: p.is_ad,
    kind: (p as { kind?: string | null }).kind ?? null,
    url: p.url,
  };
}

function byEngagement(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => engagementOf(b) - engagementOf(a));
}

function byRecency(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
}

interface StoredAd {
  advertiser?: unknown;
  headline?: unknown;
  snippet?: unknown;
  cta?: unknown;
  landing?: unknown;
  url?: unknown;
  startedOn?: unknown;
  runningDays?: unknown;
  variants?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Meta dynamic catalog ads come back as their template, not their copy. */
export function isTemplateText(text: string): boolean {
  return /\{\{\s*[\w.]+\s*\}\}/.test(text);
}

/**
 * The ads a stored read holds, re-checked against the rival's name: reads
 * taken before the matcher was strict carry other companies' ads, and a
 * dossier that quotes an IRS guide as a haircare rival's ad is worse than
 * one that says the rival's ads were not read.
 */
export function adsFromRead(read: CompetitorRead, rival: string, facebook: string | null = null): DossierAd[] {
  const stored = (read.raw as { ads?: unknown } | null)?.ads;
  if (!Array.isArray(stored)) return [];
  const out: DossierAd[] = [];
  for (const a of stored as StoredAd[]) {
    const advertiser = str(a.advertiser);
    if (advertiser && !isRivalAd({ name: rival, facebook }, { advertiser, pageUrl: null }) && !facebook) continue;
    const headline = str(a.headline);
    const snippet = str(a.snippet);
    const text = [headline, snippet].filter((x): x is string => typeof x === "string" && !isTemplateText(x)).join(" ").trim();
    out.push({
      rival,
      advertiser,
      headline: headline && !isTemplateText(headline) ? headline : null,
      text: clip(text, 600),
      cta: str(a.cta),
      landing: str(a.landing),
      startedOn: str(a.startedOn),
      runningDays: num(a.runningDays),
      variants: num(a.variants),
      theme: text ? classifyAdCopy(text) : null,
      url: str(a.url),
    });
  }
  return out.sort((a, b) => (b.runningDays ?? -1) - (a.runningDays ?? -1));
}

const STOP = new Set(["the", "and", "for", "with", "your", "you", "our", "that", "this", "from", "are", "get", "now", "new", "all", "off", "free", "shop"]);

/** Phrases of three or four words that appear in two or more rivals' ad text. */
export function sharedPhrases(ads: DossierAd[]): { phrase: string; rivals: string[] }[] {
  const seen = new Map<string, Set<string>>();
  for (const ad of ads) {
    const words = ad.text
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const local = new Set<string>();
    for (const n of [3, 4]) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (gram.every((w) => STOP.has(w) || w.length < 3)) continue;
        local.add(gram.join(" "));
      }
    }
    for (const g of local) seen.set(g, (seen.get(g) ?? new Set()).add(ad.rival));
  }
  return [...seen.entries()]
    .filter(([, rivals]) => rivals.size >= 2)
    .map(([phrase, rivals]) => ({ phrase, rivals: [...rivals].sort() }))
    .sort((a, b) => b.rivals.length - a.rivals.length || a.phrase.localeCompare(b.phrase))
    .slice(0, 25);
}

export function themesAcrossRivals(rivals: DossierRival[]): { theme: string; ads: number; rivals: number }[] {
  const acc = new Map<string, { ads: number; rivals: Set<string> }>();
  for (const r of rivals) {
    for (const ad of r.ads?.list ?? []) {
      if (!ad.theme) continue;
      const a = acc.get(ad.theme) ?? { ads: 0, rivals: new Set<string>() };
      a.ads += 1;
      a.rivals.add(r.name);
      acc.set(ad.theme, a);
    }
  }
  return [...acc.entries()]
    .map(([theme, a]) => ({ theme, ads: a.ads, rivals: a.rivals.size }))
    .sort((a, b) => b.rivals - a.rivals || b.ads - a.ads);
}

/** The newest row per (term, source). */
function latestPerTermSource(rows: Signal[]): Map<string, Signal> {
  const out = new Map<string, Signal>();
  for (const s of rows) {
    const k = `${s.normalized_term}|${s.source}`;
    const prev = out.get(k);
    if (!prev || s.captured_at > prev.captured_at) out.set(k, s);
  }
  return out;
}

function weekDelta(points: { day: string; value: number }[]): number | null {
  const daily = points.filter((p) => p.day.length === 10).sort((a, b) => a.day.localeCompare(b.day));
  if (daily.length < 14) return null;
  const last = daily.slice(-7);
  const prev = daily.slice(-14, -7);
  const avg = (xs: { value: number }[]) => xs.reduce((s, p) => s + p.value, 0) / xs.length;
  const a = avg(prev);
  // A near-zero prior week makes any move read as thousands of percent.
  if (a < 1) return null;
  return Math.round(((avg(last) - a) / a) * 100);
}

/* ---------------------------------- build --------------------------------- */

export async function buildDossier(repo: Repo, business: Business, opts: { now?: Date } = {}): Promise<Dossier> {
  const now = opts.now ?? new Date();
  const [services, brief, competitors, posts, reads, history, comments, reviews, documents, pool] = await Promise.all([
    safe(repo.listServices(business.id), [] as Service[]),
    safe(repo.getBusinessBrief(business.id), null as BusinessBrief | null),
    safe(repo.listCompetitors(business.id), [] as Competitor[]),
    safe(repo.listSocialPosts(business.id, { sinceDays: 120 }), [] as SocialPost[]),
    safe(repo.listCompetitorReads(business.id, { sinceDays: 45 }), [] as CompetitorRead[]),
    safe(repo.listAdHistory(business.id), [] as AdHistory[]),
    safe(repo.listSocialComments(business.id, { sinceDays: 120 }), [] as SocialComment[]),
    safe(repo.listReviews(business.id), [] as Review[]),
    safe(repo.listDocuments(business.id), [] as BusinessDocument[]),
    safe(repo.listSignalsForCategory(business.category, { sinceDays: 35 }), [] as Signal[]),
  ]);
  const memory = await safe(loadBrandMemory(repo, business), new Map());

  /* brand */
  const active = services.filter((s) => s.is_active !== false);
  const catalog = active.slice(0, CAPS.catalog).map((s) => ({
    name: s.name,
    price: money(s.price_cents),
    description: s.description ? clip(s.description, 240) : null,
    inStock: typeof s.in_stock === "boolean" ? s.in_stock : null,
  }));

  /* own performance */
  const ownPosts = posts.filter((p) => p.competitor_id === null);
  const ownSocial: Dossier["ownPerformance"]["social"] = {};
  for (const platform of ["instagram", "tiktok", "facebook"] as SocialPlatform[]) {
    const mine = ownPosts.filter((p) => p.platform === platform);
    if (mine.length === 0) continue;
    ownSocial[platform] = {
      read: readAccount(mine),
      top: byEngagement(mine).slice(0, CAPS.ownPostsTop).map((p) => toPost(p, "you")),
      recent: byRecency(mine).slice(0, CAPS.ownPostsRecent).map((p) => toPost(p, "you")),
    };
  }
  const ads =
    history.length > 0
      ? {
          ...readAdHistory(history),
          top: [...history]
            .filter((r) => (r.impressions ?? 0) > 0)
            .sort((a, b) => (b.results ?? 0) - (a.results ?? 0) || (b.ctr ?? 0) - (a.ctr ?? 0))
            .slice(0, CAPS.ownAdsTop),
          source: history[0]?.source ?? null,
        }
      : null;
  const memoryText = [...memory.values()].flatMap((m) => memoryLines(m));

  /* customer: terms */
  const latest = latestPerTermSource(pool);
  const watch = new Set((brief?.watch_terms ?? []).map((t) => t.toLowerCase().trim()));
  const termRows = new Map<string, DossierTerm>();
  const termOf = (s: Signal): DossierTerm => {
    const key = s.normalized_term;
    let t = termRows.get(key);
    if (!t) {
      t = {
        term: s.term,
        monthlyVolume: null,
        yoyPct: null,
        weekDeltaPct: null,
        months: [],
        completions: [],
        origin: watch.has(s.term.toLowerCase().trim()) ? "watch" : "category",
        newsMentions30d: null,
        shortform: null,
      };
      termRows.set(key, t);
    }
    return t;
  };
  for (const s of latest.values()) {
    const raw = (s.raw ?? {}) as Record<string, unknown>;
    switch (s.source) {
      case "dataforseo": {
        const t = termOf(s);
        if (s.metric_type === "search_volume") t.monthlyVolume = num(s.value);
        if (num(raw.yoyPct) !== null) t.yoyPct = num(raw.yoyPct);
        break;
      }
      case "google_suggest": {
        const t = termOf(s);
        const sugg = raw.suggestions;
        if (Array.isArray(sugg)) t.completions = sugg.filter((x): x is string => typeof x === "string").slice(0, 10);
        break;
      }
      case "news": {
        const t = termOf(s);
        t.newsMentions30d = num(s.value);
        break;
      }
      case "tiktok":
      case "youtube": {
        const t = termOf(s);
        const top = raw.top as { title?: unknown; channel?: unknown; views?: unknown; url?: unknown } | null;
        t.shortform = {
          platform: s.source,
          views: num(s.value),
          viewsPrev: num(raw.viewsPrev),
          medianDurationSec: num(raw.medianDurationSec),
          top: top && str(top.title) ? { title: clip(str(top.title), 160), channel: str(top.channel) ?? "", views: num(top.views) ?? 0, url: str(top.url) ?? "" } : null,
        };
        break;
      }
      default:
        break;
    }
  }
  // A year of volume and the week's move for the terms that have a series.
  let termsWithSeries = 0;
  const withVolume = [...termRows.entries()].filter(([, t]) => t.monthlyVolume !== null);
  await Promise.all(
    withVolume.slice(0, CAPS.terms + CAPS.categoryPool).map(async ([key, t]) => {
      const geo = pool.find((s) => s.normalized_term === key)?.geo ?? "US";
      const series = await safe(repo.getSeries(key, geo, 420), []);
      if (series.length === 0) return;
      termsWithSeries += 1;
      const points = series.map((p) => ({ day: p.day, value: p.value }));
      t.months = monthlyVolumes(points, now).slice(-12);
      t.weekDeltaPct = weekDelta(points);
      if (t.yoyPct === null) t.yoyPct = yearOverYearFromMonthly(points, now);
    }),
  );
  const allTerms = [...termRows.values()].sort((a, b) => (b.monthlyVolume ?? -1) - (a.monthlyVolume ?? -1));
  const terms = allTerms.filter((t) => t.origin === "watch").slice(0, CAPS.terms);
  const categoryPool = allTerms.filter((t) => t.origin === "category").slice(0, CAPS.categoryPool);

  /* competitive */
  const direct = competitiveSet(competitors);
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  const rivals: DossierRival[] = direct.map((c) => {
    const adsRead = reads
      .filter((r) => r.competitor_id === c.id && r.kind === "ads")
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0];
    const raw = (adsRead?.raw ?? {}) as Record<string, unknown>;
    const list = adsRead ? adsFromRead(adsRead, c.name, c.social_handles?.facebook ?? null).slice(0, CAPS.rivalAds) : [];
    const themes = Array.isArray(raw.themes) ? (raw.themes as { theme: string; count: number }[]) : [];
    const social: DossierRival["social"] = {};
    for (const platform of ["instagram", "tiktok", "facebook"] as SocialPlatform[]) {
      const theirs = posts.filter((p) => p.competitor_id === c.id && p.platform === platform);
      if (theirs.length === 0) continue;
      social[platform] = { read: readAccount(theirs), top: byEngagement(theirs).slice(0, CAPS.rivalPostsTop).map((p) => toPost(p, c.name)) };
    }
    const theirPosts = posts.filter((p) => p.competitor_id === c.id);
    return {
      name: c.name,
      website: c.website,
      directness: c.directness,
      directnessReason: c.directness_reason,
      ads: adsRead
        ? {
            readOn: dayOf(adsRead.captured_at),
            active: adsRead.value,
            longestRunningDays: list[0]?.runningDays ?? null,
            newThisWeek: num(raw.newThisWeek),
            themes,
            list,
          }
        : null,
      social,
      moves: theirPosts.length > 0 ? rivalMoves(theirPosts, now, { days: 14, max: 4 }).map((m) => m.line) : [],
    };
  });
  const everyAd = rivals.flatMap((r) => r.ads?.list ?? []).filter((a) => a.text);

  /* customer: words */
  const commentRows = comments
    .filter((c) => c.text.trim().length >= 12)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, CAPS.quotes)
    .map((c) => ({
      where: (c.competitor_id ? "rival" : "yours") as "yours" | "rival",
      rival: c.competitor_id ? (names.get(c.competitor_id) ?? null) : null,
      text: clip(c.text, 300),
      likes: c.likes,
      postedAt: dayOf(c.posted_at),
    }));
  const reviewRows = reviews
    .filter((r) => r.source !== "seed" && r.text.trim().length >= 12)
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, CAPS.quotes)
    .map((r) => ({
      of: (r.competitor_id ? "rival" : "yours") as "yours" | "rival",
      rival: r.competitor_id ? (names.get(r.competitor_id) ?? null) : null,
      rating: r.rating,
      text: clip(r.text, 300),
      publishedAt: dayOf(r.published_at),
      source: r.source,
    }));

  /* culture */
  const growthRow = pool.find((s) => s.source === "dataforseo" && typeof (s.raw as { related?: unknown } | null)?.related !== "undefined");
  const categoryGrowth = (() => {
    const withYoy = allTerms.filter((t) => t.yoyPct !== null && t.monthlyVolume !== null);
    if (withYoy.length < 3) return null;
    const w = withYoy.reduce((s, t) => s + (t.monthlyVolume as number), 0);
    if (w <= 0) return null;
    const pct = withYoy.reduce((s, t) => s + (t.yoyPct as number) * (t.monthlyVolume as number), 0) / w;
    return { pct: Math.round(pct), basis: `volume-weighted year over year across ${withYoy.length} terms${growthRow ? "" : ""}` };
  })();

  /* coverage */
  const sourceAgg = new Map<string, { rows: number; last: string | null }>();
  for (const s of pool) {
    const a = sourceAgg.get(s.source) ?? { rows: 0, last: null };
    a.rows += 1;
    if (!a.last || s.captured_at > a.last) a.last = s.captured_at;
    sourceAgg.set(s.source, a);
  }
  const rivalsWithAdsRead = rivals.filter((r) => r.ads !== null).length;
  const missing: string[] = [];
  if (history.length === 0) missing.push("No ad results on file: nothing here is checked against what has worked for this brand.");
  if (competitors.length === 0) missing.push("No competitors named, so there is no competitive read.");
  else if (rivalsWithAdsRead === 0) missing.push("Rivals are named but none of their ads have been read yet.");
  else if (rivalsWithAdsRead < direct.length) missing.push(`Ads were read for ${rivalsWithAdsRead} of ${direct.length} direct rivals.`);
  if (everyAd.length === 0 && rivalsWithAdsRead > 0) missing.push("Rival ad reads carry no copy (image or video ads, or catalog templates), so what they say is unknown.");
  if (ownPosts.length === 0) missing.push("None of the brand's own posts have been read.");
  if (comments.length === 0 && reviewRows.length === 0) missing.push("No customer words on file: no comments and no reviews. Customer language below is from search only.");
  if (terms.filter((t) => t.monthlyVolume !== null).length === 0) missing.push("No search volume read yet.");
  if (!brief) missing.push("No brand brief written from the site yet.");

  return {
    version: DOSSIER_VERSION,
    builtAt: now.toISOString(),
    business: {
      name: business.name,
      category: business.category,
      website: business.website,
      market: business.market,
      monthlyAdSpend: business.monthly_ad_spend,
      objectives: business.campaign_objectives ?? [],
      productionFormats: business.production_formats ?? [],
      claimsNotes: business.claims_notes ?? null,
      recentCreativeNotes: business.recent_creative_notes ?? null,
      voiceNotes: business.brand_voice_notes,
    },
    brand: {
      catalog,
      positioning: brief?.positioning ?? null,
      segments: brief?.customer_segments ?? [],
      moat: brief?.moat ?? null,
      advantages: brief?.advantages ?? [],
      watchouts: brief?.watchouts ?? [],
      pricingRead: brief?.pricing_read ?? null,
      seasonality: brief?.seasonality ?? null,
      targetCustomer: targetCustomerOf(brief),
      documentFacts: documents.map((d) => ({ document: d.name, facts: (d.digest?.facts ?? []).slice(0, CAPS.documentFacts) })).filter((d) => d.facts.length > 0),
    },
    ownPerformance: { ads, social: ownSocial, memory: memoryText },
    customer: { terms, categoryPool, comments: commentRows, reviews: reviewRows },
    competitive: { rivals, themesAcrossRivals: themesAcrossRivals(rivals), sharedPhrases: sharedPhrases(everyAd) },
    culture: { categoryGrowth },
    coverage: {
      rivalsNamed: competitors.length,
      rivalsDirect: direct.length,
      rivalsWithAdsRead,
      rivalAdsStored: rivals.reduce((s, r) => s + (r.ads?.list.length ?? 0), 0),
      ownPosts: ownPosts.length,
      rivalPosts: posts.length - ownPosts.length,
      ownAdRows: history.length,
      ownAdSource: history[0]?.source ?? null,
      comments: comments.length,
      reviews: reviews.filter((r) => r.source !== "seed").length,
      documents: documents.length,
      termsWithVolume: allTerms.filter((t) => t.monthlyVolume !== null).length,
      termsWithSeries,
      sources: [...sourceAgg.entries()].map(([source, a]) => ({ source, rows: a.rows, lastRead: dayOf(a.last) })).sort((a, b) => b.rows - a.rows),
      missing,
    },
  };
}

/* --------------------------------- render --------------------------------- */

const pct = (n: number | null): string => (n === null ? "n/a" : `${n > 0 ? "+" : ""}${Math.round(n)}%`);
const n = (v: number | null | undefined): string => (typeof v === "number" ? v.toLocaleString("en-US") : "n/a");

function postLine(p: DossierPost): string {
  const metrics = [`${n(p.likes)} likes`, `${n(p.comments)} comments`, p.shares ? `${n(p.shares)} shares` : null, p.views ? `${n(p.views)} views` : null].filter(Boolean).join(", ");
  return `- ${p.postedAt ?? "undated"} · ${p.platform} · ${metrics}${p.isAd ? " · boosted" : ""}${p.kind ? ` · ${p.kind}` : ""}\n  "${p.caption || "(no caption)"}"`;
}

function accountLine(read: AccountRead): string {
  const parts = [
    `${read.postsPerWeek.toFixed(1)} posts/week${read.prevPostsPerWeek > 0 ? ` (was ${read.prevPostsPerWeek.toFixed(1)})` : " (prior 4 weeks not on file)"}`,
    `median engagement ${n(read.engagementMedian)}`,
    read.engagementRate !== null ? `engagement rate ${(read.engagementRate * 100).toFixed(1)}%` : null,
    `${Math.round(read.videoShare * 100)}% video`,
    read.silentDays !== null ? `last posted ${read.silentDays} days ago` : null,
  ].filter(Boolean);
  const kinds = Object.entries(read.byKind ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `${k} ${c}`)
    .join(", ");
  return `${parts.join(" · ")}${kinds ? ` · by kind: ${kinds}` : ""}`;
}

function termLine(t: DossierTerm): string {
  const bits = [
    t.monthlyVolume !== null ? `${n(t.monthlyVolume)}/mo` : "volume n/a",
    t.yoyPct !== null ? `YoY ${pct(t.yoyPct)}` : null,
    t.weekDeltaPct !== null ? `week ${pct(t.weekDeltaPct)}` : null,
    t.newsMentions30d !== null ? `${t.newsMentions30d} news items` : null,
  ].filter(Boolean);
  const lines = [`- "${t.term}" · ${bits.join(" · ")}`];
  if (t.months.length >= 6) lines.push(`  months: ${t.months.map((m) => `${m.month.slice(2)} ${n(m.value)}`).join(", ")}`);
  if (t.completions.length > 0) lines.push(`  people also type: ${t.completions.map((c) => `"${c}"`).join(", ")}`);
  if (t.shortform) {
    const s = t.shortform;
    lines.push(
      `  ${s.platform}: ${n(s.views)} views on recent videos${s.viewsPrev !== null ? ` (prior ${n(s.viewsPrev)})` : ""}${s.medianDurationSec !== null ? `, winners run ~${Math.round(s.medianDurationSec)}s` : ""}${s.top ? `; most viewed: "${s.top.title}" by ${s.top.channel}, ${n(s.top.views)} views` : ""}`,
    );
  }
  return lines.join("\n");
}

function adLine(a: DossierAd): string {
  const meta = [
    a.advertiser && a.advertiser.toLowerCase() !== a.rival.toLowerCase() ? `as "${a.advertiser}"` : null,
    a.runningDays !== null ? `running ${a.runningDays} days${a.startedOn ? ` since ${a.startedOn}` : ""}` : "start date unknown",
    a.cta ? `CTA "${a.cta}"` : null,
    a.variants && a.variants > 1 ? `${a.variants} variants` : null,
    a.theme ? `theme: ${a.theme}` : null,
    a.landing ? `lands on ${a.landing}` : null,
  ].filter(Boolean);
  return `- ${meta.join(" · ")}\n  "${a.text || "(image or video, no text)"}"`;
}

function section(title: string, body: string[]): string {
  return [`## ${title}`, ...(body.length > 0 ? body : ["(nothing on file)"])].join("\n");
}

/** The dossier as the model reads it: plain markdown, every section present. */
export function renderDossier(d: Dossier): string {
  const b = d.business;
  const out: string[] = [];
  out.push(`# Research dossier: ${b.name}`, `Built ${d.builtAt.slice(0, 10)} · ${b.category} · ${b.market} · site ${b.website ?? "unknown"} · paid social ${b.monthlyAdSpend ?? "unknown"}/mo`);

  out.push(
    section("Coverage: what was read, and what was not", [
      `- Rivals: ${d.coverage.rivalsNamed} named, ${d.coverage.rivalsDirect} direct, ads read for ${d.coverage.rivalsWithAdsRead}, ${d.coverage.rivalAdsStored} ads stored`,
      `- Posts: ${d.coverage.ownPosts} of the brand's own, ${d.coverage.rivalPosts} from rivals`,
      `- Own ad results: ${d.coverage.ownAdRows} rows${d.coverage.ownAdSource ? ` (${d.coverage.ownAdSource})` : ""}`,
      `- Customer words: ${d.coverage.comments} comments, ${d.coverage.reviews} reviews · Documents: ${d.coverage.documents}`,
      `- Search: ${d.coverage.termsWithVolume} terms with volume, ${d.coverage.termsWithSeries} with a history`,
      `- Sources in the last 35 days: ${d.coverage.sources.map((s) => `${s.source} (${s.rows}, last ${s.lastRead ?? "?"})`).join("; ") || "none"}`,
      ...(d.coverage.missing.length > 0 ? ["- MISSING:", ...d.coverage.missing.map((m) => `  - ${m}`)] : ["- Nothing major missing."]),
    ]),
  );

  out.push(
    section("The brand", [
      `- Objectives: ${b.objectives.join(", ") || "not stated"} · Can produce: ${b.productionFormats.join(", ") || "not stated"}`,
      b.claimsNotes ? `- May and may not claim: ${b.claimsNotes}` : "- Claims rules: none given.",
      b.recentCreativeNotes ? `- Shot recently: ${b.recentCreativeNotes}` : "- Recent creative: not described.",
      b.voiceNotes ? `- Voice: ${b.voiceNotes}` : null,
      d.brand.positioning ? `- Positioning (from the site): ${d.brand.positioning}` : null,
      d.brand.segments.length ? `- Who buys: ${d.brand.segments.join(" | ")}` : null,
      d.brand.moat ? `- Moat: ${d.brand.moat}` : null,
      d.brand.advantages.length ? `- Advantages: ${d.brand.advantages.join(" | ")}` : null,
      d.brand.watchouts.length ? `- Watchouts: ${d.brand.watchouts.join(" | ")}` : null,
      d.brand.pricingRead ? `- Pricing: ${d.brand.pricingRead}` : null,
      d.brand.seasonality ? `- Seasonality: ${d.brand.seasonality}` : null,
      ...(d.brand.targetCustomer
        ? [
            `- Target customer: ${d.brand.targetCustomer.who}`,
            `  triggers: ${d.brand.targetCustomer.triggers.join("; ") || "n/a"}`,
            `  objections: ${d.brand.targetCustomer.objections.join("; ") || "n/a"}`,
            `  their words: ${d.brand.targetCustomer.vocabulary.join(", ") || "n/a"}`,
          ]
        : ["- Target customer: not profiled."]),
      ...d.brand.documentFacts.flatMap((doc) => [`- From "${doc.document}":`, ...doc.facts.map((f) => `  - ${f}`)]),
    ].filter((x): x is string => Boolean(x))),
  );

  out.push(section("Catalog (name · price · in stock)", d.brand.catalog.map((c) => `- ${c.name}${c.price ? ` · ${c.price}` : ""}${c.inStock === false ? " · OUT OF STOCK" : ""}${c.description ? ` · ${c.description}` : ""}`)));

  const ads = d.ownPerformance.ads;
  out.push(
    section(
      "Own ad results",
      ads
        ? [
            `- ${ads.ads} ads on file (${ads.source}) · account CTR ${ads.accountCtr !== null ? `${(ads.accountCtr * 100).toFixed(2)}%` : "n/a"} · spend $${Math.round(ads.spendCents / 100).toLocaleString("en-US")} · last ran ${ads.lastRanOn ?? "n/a"}`,
            ...(ads.byTheme.length ? [`- By theme: ${ads.byTheme.map((t) => `${t.theme} ${t.ads} ads${t.vsAccount !== null ? ` at ${Math.round((t.vsAccount - 1) * 100)}% vs account` : ""}`).join("; ")}`] : []),
            ...(ads.top.length ? ["- Best by results, then CTR:", ...ads.top.map((r) => `  - ${r.ad_name ?? r.campaign_name} · ${n(r.impressions)} impr · ${n(r.clicks)} clicks · ${r.ctr !== null ? `${(r.ctr * 100).toFixed(2)}% CTR` : "CTR n/a"} · ${n(r.results)} results · $${Math.round((r.spend_cents ?? 0) / 100)}${r.copy ? ` · "${clip(r.copy, 200)}"` : ""}`)] : []),
            ...(ads.worst.length ? ["- Worst:", ...ads.worst.slice(0, CAPS.ownAdsBottom).map((r) => `  - ${r.ad_name ?? r.campaign_name} · ${r.ctr !== null ? `${(r.ctr * 100).toFixed(2)}% CTR` : "CTR n/a"} · ${n(r.results)} results${r.copy ? ` · "${clip(r.copy, 160)}"` : ""}`)] : []),
          ]
        : [],
    ),
  );

  const ownSocialLines: string[] = [];
  for (const [platform, s] of Object.entries(d.ownPerformance.social)) {
    if (!s) continue;
    ownSocialLines.push(`### ${platform}: ${accountLine(s.read)}`, "Top posts by engagement:", ...s.top.map(postLine), "Most recent:", ...s.recent.map(postLine));
  }
  out.push(section("Own social accounts", ownSocialLines));
  out.push(section("What the brand already tried (TRND record)", d.ownPerformance.memory.map((m) => `- ${m}`)));

  out.push(section("Customer: what they search (the brand's own terms)", d.customer.terms.map(termLine)));
  out.push(
    section("Customer: the category around it (terms the brand is not watching)", [
      "(Related phrases Google Ads returns for the brand's own terms, unfiltered. Some are other products, appliances or slang with the same words; judge relevance before using one.)",
      ...d.customer.categoryPool.map(termLine),
    ]),
  );
  out.push(
    section("Customer: their own words", [
      ...d.customer.comments.map((c) => `- comment under ${c.where === "yours" ? "your post" : `${c.rival}'s post`}${c.postedAt ? ` (${c.postedAt})` : ""}, ${c.likes} likes: "${c.text}"`),
      ...d.customer.reviews.map((r) => `- ${r.rating}★ review of ${r.of === "yours" ? "you" : r.rival} (${r.source}${r.publishedAt ? `, ${r.publishedAt}` : ""}): "${r.text}"`),
    ]),
  );

  const rivalLines: string[] = [];
  for (const r of d.competitive.rivals) {
    rivalLines.push(`### ${r.name}${r.website ? ` (${r.website})` : ""} · directness ${r.directness !== null ? r.directness.toFixed(2) : "n/a"}${r.directnessReason ? `: ${r.directnessReason}` : ""}`);
    if (r.ads) {
      rivalLines.push(
        `Meta ads read ${r.ads.readOn ?? "?"}: ${n(r.ads.active)} active${r.ads.longestRunningDays !== null ? `, longest ${r.ads.longestRunningDays} days` : ""}${r.ads.newThisWeek !== null ? `, ${r.ads.newThisWeek} new this week` : ""}${r.ads.themes.length ? ` · themes: ${r.ads.themes.map((t) => `${t.theme} ${t.count}`).join(", ")}` : ""}`,
      );
      rivalLines.push(...(r.ads.list.length ? r.ads.list.map(adLine) : ["- (no ads stored)"]));
    } else rivalLines.push("Meta ads: not read.");
    for (const [platform, s] of Object.entries(r.social)) {
      if (!s) continue;
      rivalLines.push(`${platform}: ${accountLine(s.read)}`, ...s.top.map(postLine));
    }
    if (r.moves.length) rivalLines.push(`Recent moves: ${r.moves.join(" | ")}`);
  }
  out.push(section("Competitors (direct rivals)", rivalLines));
  out.push(
    section("Across the rivals' ads", [
      ...(d.competitive.themesAcrossRivals.length ? [`- Themes: ${d.competitive.themesAcrossRivals.map((t) => `${t.theme} (${t.ads} ads, ${t.rivals} rivals)`).join("; ")}`] : []),
      ...(d.competitive.sharedPhrases.length ? ["- Phrases two or more rivals share:", ...d.competitive.sharedPhrases.map((p) => `  - "${p.phrase}" (${p.rivals.join(", ")})`)] : []),
    ]),
  );
  out.push(section("Culture", d.culture.categoryGrowth ? [`- Category growth: ${pct(d.culture.categoryGrowth.pct)} (${d.culture.categoryGrowth.basis})`] : []));

  return out.join("\n\n");
}
