import type { Business, BusinessBrief, Opportunity, Service, Signal } from "@/lib/db/types";
import type { RawSignal } from "@/lib/signals/types";
import { generateCampaign } from "@/lib/ai";
import {
  extractFromPages,
  fetchSiteCorpus,
  inferPriceBand,
  probeStorefrontProducts,
  type SiteImport,
} from "@/lib/import/website";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { createMetaAdsAdapter } from "@/lib/signals/adlibrary";
import { createSuggestAdapter } from "@/lib/signals/adapters/suggest";
import { createTrendsIotAdapter } from "@/lib/signals/adapters/trends-iot";
import { geoLabel, resolveMetro } from "@/lib/signals/geo";
import { normalizeTerm } from "@/lib/signals/normalize";
import { sourceUrl } from "@/lib/signals/source-url";
import { titleCase } from "@/lib/text";

import { previewTerms } from "./terms";
import type {
  DemandSnapshot,
  SnapshotAd,
  SnapshotCompetition,
  SnapshotDemandRead,
  SnapshotEvent,
  SnapshotFinding,
} from "./types";

/**
 * The public demand snapshot, assembled from a website address alone.
 *
 * Everything here already existed in pieces — the crawl, the metro
 * resolution, the adapters, the generator. What's new is the order and the
 * narration: findings are emitted the moment each one lands, because the
 * ninety seconds an owner spends waiting is the most persuasive part of the
 * product and it used to be a progress bar.
 *
 * Nothing is written to a business's tables. The synthetic Business /
 * Signal / Opportunity rows below are in-memory only, so the same generator
 * that writes a customer's campaign can write this one.
 */

const TOTAL_BUDGET_MS = 60_000;
const ADAPTER_BUDGET_MS = 14_000;
/** The ad-library read needs a headless browser — worth waiting on, briefly. */
const COMPETITION_BUDGET_MS = 20_000;

type Send = (event: SnapshotEvent) => void;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const money = (price: string) => `$${price.replace(/^\$/, "")}`;

/** "your menu page" from "/menu" — the crawl narrates in owner language. */
function pageName(path: string): string {
  const slug = path.replace(/^\/+|\/+$/g, "").split("/").pop() ?? "";
  return slug ? `your ${slug.replace(/[-_]/g, " ")} page` : "your home page";
}

/* ------------------------------- the site ------------------------------- */

async function readSite(url: string, send: Send): Promise<{ site: SiteImport; text: string }> {
  send({ type: "status", label: `Opening ${new URL(url).hostname.replace(/^www\./, "")}…` });
  const corpus = await fetchSiteCorpus(url, (e) => {
    if (e.kind === "page") send({ type: "status", label: `Read ${pageName(e.path)}` });
    else if (e.kind === "rendering") send({ type: "status", label: `Taking a closer look at ${pageName(e.path)}…` });
  });
  let site = extractFromPages(corpus.pages);
  if (site.services.length === 0) {
    send({ type: "status", label: "Checking the online store for products…" });
    try {
      site.services = await probeStorefrontProducts(url, corpus.pages[0].html);
      site.priceBand = site.priceBand ?? inferPriceBand(site.services, site.category);
    } catch {
      /* a storefront probe that fails is just a site without one */
    }
  }
  site = { ...site, priceBand: site.priceBand ?? inferPriceBand(site.services, site.category) };
  return { site, text: corpus.text };
}

/** What we learned about them, in their own numbers. */
function siteFindings(site: SiteImport, url: string): SnapshotFinding[] {
  const out: SnapshotFinding[] = [];
  const priced = site.services.filter((s) => s.price);
  if (priced.length > 0) {
    const lead = [...priced].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0];
    out.push({
      kind: "site",
      headline: `Found ${priced.length} priced item${priced.length === 1 ? "" : "s"} on your site`,
      detail: `Your ${lead.name} at ${money(lead.price)} is the one an ad can lead with — every line below is written against this list, never around it.`,
      url,
    });
  } else if (site.name) {
    out.push({
      kind: "site",
      headline: `Read ${site.name}'s site`,
      detail: "No prices published, so the ad below sells the visit rather than a number.",
      url,
    });
  }
  return out;
}

/* ------------------------------ the demand ------------------------------ */

function toDemandRead(raw: RawSignal): SnapshotDemandRead {
  const intent = raw.metric_type === "search_intent";
  return {
    term: raw.term,
    deltaPct: raw.delta_pct,
    interestLevel: intent ? null : raw.value,
    intentCount: intent ? raw.value : null,
    geoLabel: geoLabel(raw.geo),
    source: raw.source,
    url: sourceUrl({ source: raw.source, term: raw.term, geo: raw.geo, raw: raw.raw }),
    measured: !intent,
  };
}

function demandFinding(read: SnapshotDemandRead): SnapshotFinding {
  if (read.measured && typeof read.deltaPct === "number") {
    const dir = read.deltaPct >= 0 ? "up" : "down";
    return {
      kind: "demand",
      headline: `${read.geoLabel}: "${read.term}" is ${dir} ${Math.abs(Math.round(read.deltaPct))}% this week`,
      detail: "Measured where your customers are, not nationally.",
      url: read.url,
    };
  }
  if (read.intentCount) {
    return {
      kind: "demand",
      headline: `${read.intentCount} of the phrases people type after "${read.term}" are buying phrases`,
      detail: '"near me", "cost", "book" — the searches of someone about to spend.',
      url: read.url,
    };
  }
  return {
    kind: "demand",
    headline: `Measured "${read.term}" in ${read.geoLabel}`,
    url: read.url,
  };
}

/* --------------------------- the ad they'd run --------------------------- */

const HOUR = 3600_000;

/** In-memory rows so the product's own generator can write this ad. */
function syntheticBusiness(site: SiteImport, url: string): Business {
  return {
    id: "preview",
    owner_id: "preview",
    name: site.name || new URL(url).hostname.replace(/^www\./, ""),
    category: site.category || "Retail & boutiques",
    city: site.city || "",
    region: site.region ?? null,
    country: "US",
    lat: null,
    lng: null,
    radius_miles: 10,
    website: url,
    price_band: site.priceBand ?? null,
    brand_voice_notes: site.voiceHint ?? null,
    photo_urls: site.photos ?? [],
    created_at: new Date().toISOString(),
  } as Business;
}

function syntheticServices(site: SiteImport): Service[] {
  return site.services.slice(0, 12).map((s, i) => ({
    id: `preview-service-${i}`,
    business_id: "preview",
    name: s.name,
    description: null,
    price_cents: Number.isFinite(parseFloat(s.price)) ? Math.round(parseFloat(s.price) * 100) : null,
    is_active: true,
  }));
}

async function writeTheAd(
  site: SiteImport,
  url: string,
  lead: SnapshotDemandRead,
  send: Send,
): Promise<{ ad: SnapshotAd; modelUsed: string } | null> {
  const business = syntheticBusiness(site, url);
  const services = syntheticServices(site);
  const signal: Signal = {
    id: "preview-signal",
    source: lead.source,
    term: lead.term,
    normalized_term: normalizeTerm(lead.term),
    category: business.category,
    geo: business.region ? `US-${business.region.toUpperCase()}` : "US",
    metric_type: lead.measured ? "search_interest" : "search_intent",
    value: lead.interestLevel ?? lead.intentCount,
    delta_pct: lead.deltaPct,
    window_days: 7,
    captured_at: new Date().toISOString(),
    raw: null,
  };
  // The service whose name the winning term came from, when it came from one.
  const service =
    services.find((s) => normalizeTerm(s.name).includes(normalizeTerm(lead.term))) ??
    services.find((s) => normalizeTerm(lead.term).includes(normalizeTerm(s.name))) ??
    services[0] ??
    null;
  const opportunity: Opportunity = {
    id: "preview-opportunity",
    business_id: "preview",
    signal_id: signal.id,
    week_of: new Date().toISOString().slice(0, 10),
    score: 7,
    rationale: `"${lead.term}" is moving in ${lead.geoLabel}`,
    matched_service_id: service?.id ?? null,
    competitor_gap: null,
    relevance: 1,
    status: "new",
    created_at: new Date().toISOString(),
  };
  const brief: BusinessBrief | null = null;
  try {
    const generated = await withTimeout(
      generateCampaign({ business, signal, opportunity, service, services, brief }, (label) =>
        send({ type: "status", label }),
      ),
      ADAPTER_BUDGET_MS * 2,
      "writing the ad",
    );
    const { angle, assets } = generated.result;
    return {
      ad: {
        term: lead.term,
        hook: angle.hook,
        angle: angle.angle,
        offer: angle.offer,
        who: angle.audience.who,
        headlines: assets.headlines.slice(0, 3),
        primaryText: assets.primary_texts[0] ?? null,
        service: service?.name ?? null,
      },
      modelUsed: generated.model_used,
    };
  } catch (err) {
    console.warn("[preview] ad generation failed:", (err as Error).message);
    return null;
  }
}

/* ------------------------------ the assembly ----------------------------- */

export interface BuildResult {
  ok: true;
  snapshot: DemandSnapshot;
}
export interface BuildFailure {
  ok: false;
  reason: string;
}

/**
 * Build a snapshot for one public URL. Never throws: a step that fails is a
 * source that stays quiet, and the snapshot says which ones did.
 */
export async function buildDemandSnapshot(
  url: string,
  send: Send = () => {},
): Promise<BuildResult | BuildFailure> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const findings: SnapshotFinding[] = [];
  const quiet: string[] = [];
  const emit = (finding: SnapshotFinding) => {
    findings.push(finding);
    send({ type: "finding", finding });
  };

  let site: SiteImport;
  try {
    site = (await readSite(url, send)).site;
  } catch (err) {
    console.warn("[preview] site read failed:", (err as Error).message);
    return {
      ok: false,
      reason: "We couldn't read that site — it may be blocking us. Try the address you'd give a customer.",
    };
  }
  if (!site.name && site.services.length === 0 && !site.city) {
    return { ok: false, reason: "We couldn't find enough on that page to read the business." };
  }
  for (const f of siteFindings(site, url)) emit(f);

  const category = site.category || "Retail & boutiques";
  const metro = site.city ? resolveMetro(site.city, site.region ?? null) : null;
  const stateGeo = site.region ? `US-${site.region.toUpperCase()}` : "US";
  const geo = metro?.geo ?? stateGeo;
  const metroLabel = geoLabel(geo);
  if (site.city) {
    emit({
      kind: "place",
      headline: metro
        ? `${site.city} sits in the ${metroLabel} — demand below is measured there`
        : `Reading demand for ${site.city}`,
      detail: metro
        ? "Most tools measure a trend nationally. A trend that is real in New York and dead in your metro is not an opportunity."
        : undefined,
    });
  }

  const terms = previewTerms(site);
  const locality = (site.city ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const watch = terms.all.map((term) => ({ term, category, geo, locality }));

  // ---- demand: what is moving, and how transactional it is
  const demand: SnapshotDemandRead[] = [];
  for (const [adapter, label] of [
    [createTrendsIotAdapter(), "Google Trends"],
    [createSuggestAdapter(), "Google autocomplete"],
  ] as const) {
    if (Date.now() > deadline) break;
    send({ type: "status", label: `Measuring ${terms.all.length} terms in ${metroLabel}…` });
    try {
      const raw = await withTimeout(
        adapter.fetch({ terms: [], watch, geo, windowDays: 7 }),
        ADAPTER_BUDGET_MS,
        label,
      );
      for (const r of raw.slice(0, 6)) {
        const read = toDemandRead(r);
        demand.push(read);
        emit(demandFinding(read));
      }
      if (raw.length === 0) quiet.push(label);
    } catch (err) {
      console.warn(`[preview] ${label} failed:`, (err as Error).message);
      quiet.push(label);
    }
  }

  // ---- competition: who else is buying these words right now
  const competition: SnapshotCompetition[] = [];
  if (Date.now() < deadline) {
    send({ type: "status", label: "Checking who else is advertising on this…" });
    try {
      const raw = await withTimeout(
        createMetaAdsAdapter().fetch({ terms: [], watch: watch.slice(0, 3), geo, windowDays: 7 }),
        COMPETITION_BUDGET_MS,
        "Meta Ad Library",
      );
      for (const r of raw) {
        const ads = (r.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads ?? [];
        const row: SnapshotCompetition = {
          term: r.term,
          activeAds: r.value,
          advertisers: ads.map((a) => a.advertiser).slice(0, 4),
          sample: ads[0]?.snippet ?? null,
          url: sourceUrl({ source: "meta_ads", term: r.term, geo: r.geo, raw: r.raw }),
        };
        competition.push(row);
        emit({
          kind: "competition",
          headline:
            row.activeAds && row.activeAds > 0
              ? `${row.activeAds} active ad${row.activeAds === 1 ? "" : "s"} running on "${r.term}"`
              : `Nobody is advertising on "${r.term}" right now`,
          detail: row.sample ? `${row.advertisers[0] ?? "A rival"} is running: "${row.sample}"` : undefined,
          url: row.url,
        });
      }
      if (raw.length === 0) quiet.push("Meta Ad Library");
    } catch (err) {
      console.warn("[preview] ad library failed:", (err as Error).message);
      quiet.push("Meta Ad Library");
    }
  }

  // ---- the calendar: what is coming, with the lead time to be ready
  const moments = upcomingMoments(category).map((m) => ({
    label: m.label,
    daysOut: m.daysOut,
    leadWeeks: m.leadWeeks,
    advice: m.advice,
  }));
  for (const m of moments.slice(0, 1)) {
    emit({
      kind: "calendar",
      headline: `${m.label} is ${m.daysOut} days out — creative should start ${m.leadWeeks} weeks ahead`,
      detail: m.advice,
    });
  }

  // ---- the ad: the strongest read, written against their own menu
  const lead =
    [...demand].sort((a, b) => {
      const av = a.measured ? (a.deltaPct ?? 0) + 100 : (a.intentCount ?? 0);
      const bv = b.measured ? (b.deltaPct ?? 0) + 100 : (b.intentCount ?? 0);
      return bv - av;
    })[0] ??
    // Nothing measured (every source quiet): still write the ad, against the
    // best thing on their menu, and let the page say the read was thin.
    (terms.all[0]
      ? {
          term: terms.all[0],
          deltaPct: null,
          interestLevel: null,
          intentCount: null,
          geoLabel: metroLabel,
          source: "snapshot" as const,
          url: null,
          measured: false,
        }
      : null);

  let ad: SnapshotAd | null = null;
  let modelUsed = "none";
  if (lead) {
    send({ type: "status", label: `Writing the ad for "${lead.term}"…` });
    const written = await writeTheAd(site, url, lead, send);
    if (written) {
      ad = written.ad;
      modelUsed = written.modelUsed;
    }
  }

  const snapshot: DemandSnapshot = {
    business: {
      name: site.name || new URL(url).hostname.replace(/^www\./, ""),
      category,
      city: site.city ?? null,
      region: site.region ?? null,
      website: url,
      priceBand: site.priceBand ?? null,
      services: site.services.slice(0, 8).map((s) => ({ name: titleCase(s.name), price: s.price })),
      photo: site.photos?.[0] ?? null,
    },
    metroLabel,
    findings,
    demand,
    competition,
    moments,
    ad,
    quiet: [...new Set(quiet)],
    modelUsed,
    generatedAt: new Date().toISOString(),
  };
  return { ok: true, snapshot };
}

export const SNAPSHOT_FRESH_MS = 12 * HOUR;
