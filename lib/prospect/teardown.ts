import { generateBusinessBrief } from "@/lib/ai/brief";
import type { Repo } from "@/lib/db/repo";
import type { Business, Service } from "@/lib/db/types";
import { isModelConfigured } from "@/lib/env";
import { fetchStorefrontCatalog, fillCatalogPrices, linkedProductHandles, type CatalogProduct } from "@/lib/import/catalog";
import { extractFromPages, fetchSiteCorpus, inferPriceBand, looksLikeStorefront, normalizeUrl } from "@/lib/import/website";
import { discoverCompetingBrands } from "@/lib/intel/discover-brands";
import { runIntelIngestForBusiness } from "@/lib/intel/ingest";
import type { DossierCoverage } from "@/lib/research/dossier";
import type { StrategyRead } from "@/lib/research/strategist";
import { ensureWeekStrategy } from "@/lib/research/weekly";

/**
 * The free account read: the sales pitch, the demo and the lead magnet in
 * one email. A prospect's site is read the way a customer's is at
 * onboarding (products, prices, voice), the founding analysis is written,
 * its rivals are proposed and their ads read, and the strategist reads
 * the whole dossier. The teardown quotes the situation, the strongest
 * insights and the top three angles, and says what could not be read.
 *
 * Everything lands on a shadow business the founder owns, flagged
 * `prospect`, which no cron ever picks up. The whole run costs the same
 * model and provider calls a signup does, and takes a few minutes.
 */

export interface TeardownStatus {
  type: "status";
  label: string;
}

export interface Teardown {
  businessId: string;
  brand: string;
  subject: string;
  body: string;
  read: StrategyRead | null;
  coverage: DossierCoverage | null;
}

export interface AccountReadOptions {
  onStatus?: (label: string) => void;
  /** The intel read's budget; rivals' ads take most of it. */
  intelBudgetMs?: number;
  /** Test seams. */
  readSite?: typeof readProspectSite;
  now?: Date;
}

export interface ProspectSite {
  name: string;
  category: string;
  city: string;
  region: string | null;
  website: string;
  priceBand: string | null;
  voiceHint: string | null;
  services: { name: string; price: string }[];
  text: string;
}

/** The site read the onboarding import does, without the wizard. */
export async function readProspectSite(url: string, onStatus: (label: string) => void = () => {}): Promise<ProspectSite> {
  onStatus(`Reading ${new URL(url).hostname.replace(/^www\./, "")}…`);
  const corpus = await fetchSiteCorpus(url, () => {});
  const data = extractFromPages(corpus.pages);
  let catalog: CatalogProduct[] = [];
  const catalogOpts = { brand: `${new URL(url).hostname.replace(/^www\./, "").split(".")[0]} ${data.name ?? ""}`, linkedHandles: linkedProductHandles(corpus.pages) };
  if (data.services.length === 0 || looksLikeStorefront(corpus.pages[0]?.html ?? "")) {
    onStatus("Reading the store's catalog…");
    catalog = await fetchStorefrontCatalog(url, corpus.pages[0]?.html ?? "");
    data.services = fillCatalogPrices(data.services, catalog, { ...catalogOpts, append: 12 });
    data.priceBand = data.priceBand ?? inferPriceBand(data.services, data.category);
  }
  if (isModelConfigured) {
    onStatus("Making sense of what was found…");
    try {
      const { extractSiteWithModel } = await import("@/lib/ai/openai");
      const refined = await extractSiteWithModel(corpus.text, url);
      const services = refined.services.length > 0 ? fillCatalogPrices(refined.services, catalog, { ...catalogOpts, append: 12 }) : data.services;
      data.name = refined.name ?? data.name;
      data.category = refined.category ?? data.category;
      data.city = refined.city ?? data.city;
      data.region = refined.region ?? data.region;
      data.services = services;
      data.voiceHint = refined.voiceHint ?? data.voiceHint;
      data.priceBand = refined.priceBand ?? inferPriceBand(services, data.category) ?? data.priceBand;
    } catch (err) {
      console.warn("[teardown] model refine failed; using heuristics:", (err as Error).message);
    }
  }
  const host = new URL(url).hostname.replace(/^www\./, "");
  return {
    name: data.name ?? host.split(".")[0],
    category: data.category ?? "Consumer brand",
    city: data.city ?? "",
    region: data.region ?? null,
    website: url,
    priceBand: data.priceBand ?? null,
    voiceHint: data.voiceHint ?? null,
    services: data.services.slice(0, 40),
    text: corpus.text.slice(0, 12_000),
  };
}

const cents = (price: string): number | null => {
  const n = Math.round(parseFloat(price.replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Runs the whole read for one prospect and returns the teardown. Never
 * skips a stage silently: a stage that fails is logged and the read goes
 * on with what it has, and the email says what was not read.
 */
export async function runAccountRead(repo: Repo, input: { website: string; ownerId: string }, opts: AccountReadOptions = {}): Promise<Teardown> {
  const onStatus = opts.onStatus ?? (() => {});
  const url = normalizeUrl(input.website);
  if (!url) throw new Error("That does not look like a web address.");
  const site = await (opts.readSite ?? readProspectSite)(url, onStatus);

  onStatus(`Setting up a read of ${site.name}…`);
  const business: Business = await repo.createBusiness({
    owner_id: input.ownerId,
    name: site.name,
    category: site.category,
    city: site.city,
    region: site.region,
    country: "US",
    lat: null,
    lng: null,
    radius_miles: 20,
    website: site.website,
    price_band: site.priceBand,
    brand_voice_notes: site.voiceHint,
    photo_urls: [],
    social_handles: {},
    market: "online",
    monthly_ad_spend: null,
    ad_platforms: ["meta"],
    prospect: true,
  });
  const services: Service[] = await repo.createServices(
    site.services.map((s) => ({ business_id: business.id, name: s.name, description: null, price_cents: cents(s.price), is_active: true })),
  );

  onStatus("Writing the founding analysis…");
  try {
    await repo.upsertBusinessBrief(await generateBusinessBrief(business, services, site.text));
  } catch (err) {
    console.warn("[teardown] founding analysis failed:", (err as Error).message);
  }

  onStatus("Naming the competitors and reading their ads…");
  try {
    await discoverCompetingBrands(repo, business);
  } catch (err) {
    console.warn("[teardown] rival discovery failed:", (err as Error).message);
  }
  try {
    await runIntelIngestForBusiness(repo, business, { budgetMs: opts.intelBudgetMs ?? 150_000 });
  } catch (err) {
    console.warn("[teardown] intel read failed:", (err as Error).message);
  }

  onStatus("The strategist is reading the whole dossier…");
  let read: StrategyRead | null = null;
  let coverage: DossierCoverage | null = null;
  try {
    const strategy = await ensureWeekStrategy(repo, business, { now: opts.now });
    read = strategy?.read ?? null;
    coverage = strategy?.dossier.coverage ?? null;
  } catch (err) {
    console.warn("[teardown] strategist failed:", (err as Error).message);
  }

  const { subject, body } = renderTeardown({ brand: site.name, read, coverage, services });
  return { businessId: business.id, brand: site.name, subject, body, read, coverage };
}

/**
 * The email, in plain text the founder pastes and edits. Short on purpose:
 * the situation in one paragraph, the two or three strongest insights, the
 * top three angles as one line each, what could not be read, and the ask.
 * Nothing invented: with no read, the email says so and offers the read.
 */
export function renderTeardown(input: { brand: string; read: StrategyRead | null; coverage: DossierCoverage | null; services: Pick<Service, "name">[] }): { subject: string; body: string } {
  const { brand, read, coverage } = input;
  const subject = read ? `${brand}: three creative tests worth running, and why` : `${brand}: a free read of your account`;
  if (!read) {
    return {
      subject,
      body: [
        `Hi,`,
        ``,
        `I read ${brand}'s site${input.services.length ? ` (${input.services.length} products)` : ""} to write you a free account read: where the brand sits, what the rivals are saying, and the three creative tests I would run first. The reads that make that honest (your rivals' live ads, your customers' own words) did not come back on the first pass, so I would rather not send you a guess.`,
        ``,
        `If you reply with your site and one Ads Manager export, I will send the full read this week. It is free, it is not a pitch deck, and it says what the evidence cannot say.`,
        ``,
        `TRND writes weekly creative test briefs for DTC brands on Meta and keeps score in public.`,
      ].join("\n"),
    };
  }
  const byConfidence = { high: 0, medium: 1, low: 2 } as const;
  const insights = [...read.insights].sort((a, b) => byConfidence[a.confidence] - byConfidence[b.confidence]).slice(0, 3);
  const angles = [...read.angles].sort((a, b) => a.priority - b.priority).slice(0, 3);
  const missing = (coverage?.missing ?? []).slice(0, 3);
  const readLine = coverage
    ? `This is from ${coverage.rivalsWithAdsRead} ${coverage.rivalsWithAdsRead === 1 ? "rival's" : "rivals'"} live ads (${coverage.rivalAdsStored} ads), ${coverage.comments + coverage.reviews} customer comments and reviews, and your site.`
    : null;
  const body = [
    `Hi,`,
    ``,
    `I ran ${brand} through TRND, the way we read a brand on its first day. No pitch, just the read. Here is what came back.`,
    ``,
    `WHERE YOU ARE`,
    read.situation,
    ``,
    `WHAT THE READS SHOW`,
    ...insights.map((i) => `- ${i.insight} (${i.confidence} confidence: ${i.why_confidence})`),
    ``,
    `THREE TESTS I WOULD RUN FIRST`,
    ...angles.map((a, n) => `${n + 1}. ${a.title}, on ${a.product}. ${a.the_bet} Why now: ${a.why_now}`),
    ``,
    ...(read.whitespace.length ? [`WHAT NO RIVAL IS SAYING`, ...read.whitespace.slice(0, 2).map((w) => `- ${w}`), ``] : []),
    `WHAT I COULD NOT READ`,
    ...(missing.length ? missing.map((m) => `- ${m}`) : ["- Your own ad results. An Ads Manager export turns this into a read of what has worked for you, not only what the market says."]),
    ``,
    ...(readLine ? [readLine, ``] : []),
    `If you want next Monday's briefs written from this, each a hypothesis with its evidence and what that evidence cannot say, reply and I will set you up. The record of every test we brief is public.`,
  ].join("\n");
  return { subject, body };
}
