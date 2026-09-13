import type { Repo } from "@/lib/db/repo";
import type { Business, BusinessBrief, Competitor, SocialHandles } from "@/lib/db/types";
import {
  classifyCategory,
  discoverMenuSubpages,
  extractFromHtml,
  fetchSiteHtml,
  htmlToText,
  inferPriceBand,
  looksBlocked,
  normalizeUrl,
  type ImportedService,
} from "@/lib/import/website";
import { poolSocialHandles } from "@/lib/import/social-links";
import { tokens } from "@/lib/scoring";

/**
 * The DIRECT competitor. Nearest same-category is not the rival an owner
 * loses customers to: a coffee shop's real rival pours the same cortado at
 * the same price on the same block, not the diner two doors down that also
 * sells coffee. Places can only tell us the category and the distance, so
 * the rival's own site settles the rest: what they sell, what they charge,
 * and where they post. Everything here is best-effort; a site we can't read
 * leaves a capped, honestly-labeled guess, never a confident one.
 *
 * An online brand has no block. Its rival sells the same serum to the same
 * customer at the same price from anywhere, and the tell that they are
 * fighting for that customer is that they are paying Meta to reach them
 * right now. So for an online business distance is ignored entirely and
 * the live ad count joins the reason.
 */

export interface RivalSiteRead {
  /** Plain text of the pages read, menu page first, capped. */
  text: string;
  services: { name: string; price: string }[];
  priceBand: string | null;
  handles: SocialHandles;
}

/** Same total budget as one onboarding fetch: a rival read never holds up a seed. */
const READ_BUDGET_MS = 8000;
const MAX_RIVAL_TEXT = 6000;

/** Resolves null when the promise fails or the budget runs out first. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  if (ms <= 0) return Promise.resolve(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise.catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

/**
 * One polite read of a rival's site: the homepage plus, when it links one,
 * a single menu page (where the prices and item names live). Never throws.
 */
export async function readRivalSite(
  url: string,
  opts: { fetchHtml?: (url: string) => Promise<string>; category?: string | null } = {},
): Promise<RivalSiteRead | null> {
  try {
    const fetchHtml = opts.fetchHtml ?? fetchSiteHtml;
    const home = normalizeUrl(url);
    if (!home) return null;
    const deadline = Date.now() + READ_BUDGET_MS;
    const homeHtml = await within(fetchHtml(home), deadline - Date.now());
    if (!homeHtml || looksBlocked(homeHtml)) return null;
    const pages = [{ url: home, html: homeHtml }];

    // A link whose path says "menu" beats "bar" or "catering": it's the one
    // most likely to list the whole priced menu.
    const subpages = discoverMenuSubpages(homeHtml, home);
    const menuUrl = subpages.find((l) => /menu/i.test(new URL(l).pathname)) ?? subpages[0];
    if (menuUrl) {
      const menuHtml = await within(fetchHtml(menuUrl), deadline - Date.now());
      if (menuHtml && !looksBlocked(menuHtml)) pages.push({ url: menuUrl, html: menuHtml });
    }

    const services: ImportedService[] = [];
    const seen = new Set<string>();
    let ldBand: string | undefined;
    for (const page of pages) {
      const read = extractFromHtml(page.html);
      ldBand = ldBand ?? read.priceBand;
      for (const s of read.services) {
        const key = s.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        services.push({ name: s.name, price: s.price });
      }
    }
    // The menu page goes first, so the cap cuts the homepage's hero copy
    // rather than the item names.
    const text = [...pages]
      .reverse()
      .map((p) => htmlToText(p.html))
      .join("\n")
      .slice(0, MAX_RIVAL_TEXT);
    // Banded against the owner's category when we know it, so "$$" means
    // the same thing on both sides of the comparison.
    const category = opts.category ?? classifyCategory(text);
    const priceBand = ldBand ?? inferPriceBand(services, category) ?? null;
    return { text, services, priceBand, handles: poolSocialHandles(pages) };
  } catch {
    return null;
  }
}

/* ------------------------------ scoring ------------------------------ */

export interface DirectnessInput {
  ownServices: { name: string; price_cents: number | null }[];
  ownCategory: string;
  ownPriceBand: string | null;
  ownLexicon: string[];
  /** "online" drops distance from the score and the reason: brands meet
   * their rivals in a feed, not on a street. Absent means local. */
  ownMarket?: "online" | "local";
  rival: {
    name: string;
    category?: string | null;
    distanceMiles?: number | null;
    site?: RivalSiteRead | null;
    reviewCount?: number | null;
    /** Live Meta ads right now, when the Ad Library was read. */
    activeMetaAds?: number | null;
  };
}

/** Without their site we only know category, name and distance: never more than a lean. */
export const UNREAD_DIRECTNESS_CAP = 0.6;

// Words on every menu that say nothing about what is sold.
const MENU_FILLER = new Set([
  "small", "medium", "large", "add", "extra", "hot", "iced", "house", "fresh", "each", "side", "regular",
  "special", "specials", "classic", "our", "made", "daily", "menu", "item", "items", "price", "oz",
]);

const BANDS = ["$", "$$", "$$$"];

const menuTokens = (text: string) => [...tokens(text)].filter((t) => !MENU_FILLER.has(t) && !/^\d+$/.test(t));

/**
 * How much of the owner's menu shows up on the rival's side, weighted by
 * rarity: a word in five of the owner's items ("latte") counts once across
 * them, while a word in one ("cortado", "croissant") counts in full. Without
 * the weighting, one shared generic word lets a diner cover a coffee menu.
 * Returns the weighted coverage and the owner items that matched, best first.
 */
function menuOverlap(
  ownItems: string[],
  rivalText: string,
): { coverage: number; matched: string[]; vocab: Set<string> } {
  const itemTokens = ownItems.map((name) => ({ name, toks: menuTokens(name) }));
  const df = new Map<string, number>();
  for (const { toks } of itemTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const rival = new Set(menuTokens(rivalText));
  let total = 0;
  let hit = 0;
  for (const [t, n] of df) {
    const w = 1 / n;
    total += w;
    if (rival.has(t)) hit += w;
  }
  const matched = itemTokens
    .map(({ name, toks }) => ({
      name,
      share: toks.length === 0 ? 0 : toks.filter((t) => rival.has(t)).length / toks.length,
    }))
    .filter((m) => m.share >= 0.5)
    .sort((a, b) => b.share - a.share)
    .map((m) => m.name);
  return { coverage: total === 0 ? 0 : hit / total, matched, vocab: new Set(df.keys()) };
}

/** Share of the rival's own item words that are the owner's words: a diner's
 * menu is mostly eggs and burgers even when it lists a latte. */
function rivalFocus(rivalServices: { name: string }[], vocab: Set<string>): number | null {
  const toks = rivalServices.flatMap((s) => menuTokens(s.name));
  if (rivalServices.length < 3 || toks.length === 0) return null;
  return toks.filter((t) => vocab.has(t)).length / toks.length;
}

// Category words that name the business type, not the product.
const CATEGORY_FILLER = new Set(["brand", "brands", "online", "store", "shop", "company", "dtc", "direct", "consumer"]);

/**
 * What a DTC brand sells is the words on MOST of its items ("showerhead",
 * "filter"), plus its category, never the variant words on one ("gold",
 * "autoship"). The rarity-weighted menu overlap above reads a Shopify
 * catalog of bundles and refills as thirteen different products and finds
 * almost none of them on a rival's site, which is how five filtered
 * showerhead brands scored as neighbours of a filtered showerhead brand.
 * Returns the share of product words the rival's site carries, and which.
 */
export function productCoverage(
  ownItems: string[],
  ownCategory: string,
  rivalText: string,
): { coverage: number; matched: string[] } {
  const df = new Map<string, number>();
  for (const name of ownItems) for (const t of new Set(menuTokens(name))) df.set(t, (df.get(t) ?? 0) + 1);
  const floor = Math.max(2, Math.ceil(ownItems.length * 0.25));
  const product = new Set<string>();
  for (const [t, n] of df) if (n >= floor) product.add(t);
  for (const t of menuTokens(ownCategory)) if (!CATEGORY_FILLER.has(t)) product.add(t);
  if (product.size === 0) return { coverage: 0, matched: [] };
  const rival = new Set(menuTokens(rivalText));
  const squashed = rivalText.toLowerCase().replace(/[^a-z0-9]/g, "");
  // "showerheads" on their site is "showerhead" on yours, and "shower head"
  // written as two words is the same product.
  const has = (t: string) =>
    rival.has(t) ||
    rival.has(`${t}s`) ||
    (t.endsWith("s") && rival.has(t.slice(0, -1))) ||
    (t.length >= 6 && squashed.includes(t));
  const matched = [...product].filter(has);
  // A rival never lists your bundles and refills by name: six of ten
  // product words on their site is the same product, and full marks.
  return { coverage: Math.min(1, matched.length / product.size / PRODUCT_FULL_SHARE), matched };
}

// Packaging words: true product-word matches, but not how an owner names the product.
const PACKAGING = new Set(["bundle", "bundles", "replacement", "refill", "refills", "subscription", "autoship", "kit", "pack", "set", "wall", "mount", "mounted", "shipping", "protection"]);

/** The matched product words as an owner would say them: the category
 * phrase when the rival carries all of it ("filtered showerhead"), then up
 * to two more product words, never packaging. */
function productPhrase(matched: string[], ownCategory: string): string[] {
  const category = menuTokens(ownCategory).filter((t) => !CATEGORY_FILLER.has(t));
  const hit = new Set(matched);
  const out: string[] = [];
  if (category.length > 0 && category.every((t) => hit.has(t))) out.push(category.join(" "));
  const used = new Set(category);
  for (const t of matched) {
    if (out.length >= 3) break;
    if (used.has(t) || PACKAGING.has(t)) continue;
    // "filters" beside "filter", or a word the category phrase already says.
    if (used.has(t.replace(/s$/, "")) || used.has(`${t}s`)) continue;
    used.add(t);
    out.push(t);
  }
  return out;
}

/** Share of a brand's product words a rival must carry to count as selling the same thing. */
const PRODUCT_FULL_SHARE = 0.6;
/** Lexicon hits that say the rival talks to the same customer. */
const CUSTOMER_FULL_HITS = 4;

/**
 * The customer a brand sells to is the brief's lexicon: the words that
 * customer uses ("chlorine", "brassy", "renter"). A rival whose site speaks
 * that language is selling to the same person. Multi-word lexicon entries
 * arrive squashed ("hardwater"), so the squashed site text is checked too.
 * Four hits is full marks: a lexicon runs to twenty words and no site says
 * them all.
 */
export function customerCoverage(ownLexicon: string[], rivalText: string): { coverage: number; matched: string[] } {
  const words = [...new Set(ownLexicon.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((w) => w.length > 2))];
  if (words.length === 0) return { coverage: 0, matched: [] };
  const rival = new Set(menuTokens(rivalText));
  const squashed = rivalText.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matched = words.filter((w) => rival.has(w) || (w.length >= 6 && squashed.includes(w)));
  return { coverage: Math.min(1, matched.length / Math.min(CUSTOMER_FULL_HITS, words.length)), matched };
}

/** "Cold Brew (16oz)" to "cold brew": how an owner says an item in a sentence. */
function plainItem(name: string): string {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/[—–→|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 28)
    .trim();
}

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function distancePhrase(miles: number | null | undefined): string | null {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles < 0) return null;
  const d = Math.round(miles * 10) / 10;
  return `${d} ${d === 1 ? "mile" : "miles"} away`;
}

function adsPhrase(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  return `runs ${count} Meta ${count === 1 ? "ad" : "ads"} right now`;
}

/**
 * 0..1, how directly a rival competes for the same customer, with the one
 * sentence an owner reads for why. Pure: every input arrives already read.
 */
export function scoreDirectness(input: DirectnessInput): { directness: number; reason: string } {
  const { rival } = input;
  const ownItems = [...input.ownServices.map((s) => s.name), ...input.ownLexicon].filter((s) => s.trim());
  const online = input.ownMarket === "online";
  const distance = online ? null : distancePhrase(rival.distanceMiles);
  const ads = adsPhrase(rival.activeMetaAds);

  // Close enough to share a walk-in customer, or far enough that few
  // would cross town for the same drink. Neither means anything online.
  let distanceAdj = 0;
  if (!online && typeof rival.distanceMiles === "number") {
    if (rival.distanceMiles <= 2) distanceAdj = 0.1;
    else if (rival.distanceMiles > 8) distanceAdj = -0.1;
  }

  const site = rival.site ?? null;
  if (!site) {
    // The name and Places category still hint ("Espresso Bar"), but a
    // guess from a name must never outrank a menu we actually read.
    const hint = menuOverlap(ownItems, `${rival.name} ${rival.category ?? ""}`);
    const directness = clamp(Math.min(UNREAD_DIRECTNESS_CAP, 0.3 + 0.3 * hint.coverage + distanceAdj));
    const where = online
      ? `Sells to a customer like yours${ads ? ` and ${ads}` : ""}`
      : distance
        ? `Same category, ${distance}`
        : "Same category";
    return {
      directness: round2(directness),
      reason: `${where}, but we couldn't read their website, so how closely they compete is a rough guess.`,
    };
  }

  const rivalText = `${site.services.map((s) => s.name).join("\n")}\n${site.text}`;
  const overlap = menuOverlap(ownItems, rivalText);
  const focus = rivalFocus(site.services, overlap.vocab);
  let menuScore = focus === null ? overlap.coverage : 0.6 * overlap.coverage + 0.4 * focus;

  // Online, the same product to the same customer is the whole test. The
  // item-by-item overlap still counts when it is the stronger read (a rival
  // with the identical range), but a rival carrying the brand's product
  // words and speaking its customer's language is direct even when its
  // catalog is cut differently.
  const product = online ? productCoverage(input.ownServices.map((s) => s.name), input.ownCategory, rivalText) : null;
  const customer = online ? customerCoverage(input.ownLexicon, rivalText) : null;
  let sameMarket = 0;
  if (product && customer) {
    sameMarket = input.ownLexicon.length === 0 ? product.coverage : 0.6 * product.coverage + 0.4 * customer.coverage;
    menuScore = Math.max(menuScore, sameMarket);
  }

  const ownBand = BANDS.indexOf(input.ownPriceBand ?? "");
  const rivalBand = BANDS.indexOf(site.priceBand ?? "");
  const bandGap = ownBand >= 0 && rivalBand >= 0 ? rivalBand - ownBand : null;
  let priceAdj = 0;
  if (bandGap === 0) priceAdj = 0.1;
  else if (bandGap !== null && Math.abs(bandGap) >= 2) priceAdj = -0.15;

  const directness = round2(clamp(0.15 + 0.6 * menuScore + priceAdj + distanceAdj));

  const items = overlap.matched
    .map(plainItem)
    .filter((s, i, all) => s && all.indexOf(s) === i)
    .slice(0, 3);
  let lead: string;
  // A brand's owner says "range", not "menu", and names the product plainly.
  if (online) {
    const productWords = product ? productPhrase(product.matched, input.ownCategory) : [];
    const customerWords = customer?.matched.slice(0, 3) ?? [];
    if (menuScore >= 0.45 && items.length > 0 && overlap.coverage >= sameMarket) lead = `Sells ${listPhrase(items)}`;
    else if (sameMarket >= 0.45 && productWords.length > 0) {
      lead = `Sells ${listPhrase(productWords)} like you${
        customerWords.length > 0 ? `, to a customer who talks about ${listPhrase(customerWords)}` : ""
      }`;
    } else if (menuScore >= 0.2 && items.length > 0) lead = `Overlaps with some of your range, like ${listPhrase(items)}`;
    else if (menuScore >= 0.2 && productWords.length > 0) lead = `Overlaps with some of your range, like ${listPhrase(productWords)}`;
    else lead = "Sells to a customer like yours, but little of your range shows up on their site";
  } else if (menuScore >= 0.45 && items.length > 0) lead = `Sells the same ${listPhrase(items)} you do`;
  else if (menuScore >= 0.2 && items.length > 0) lead = `Overlaps with some of your menu, like ${listPhrase(items)}`;
  else if (rival.category) {
    lead = `Same category, but little of your menu shows up at this ${rival.category.toLowerCase().replace(/[—–→]/g, " ")}`;
  } else lead = "Same category, but little of your menu shows up on their site";

  const price =
    bandGap === 0
      ? online
        ? "at your price point"
        : "at your prices"
      : bandGap === null
        ? null
        : Math.abs(bandGap) >= 2
          ? `at a very different price point (${site.priceBand} to your ${input.ownPriceBand})`
          : bandGap > 0
            ? "priced a step above you"
            : "priced a step below you";

  const reason = `${lead}${price ? ` ${price}` : ""}${ads ? `, and ${ads}` : ""}${distance ? `, ${distance}` : ""}.`;
  return { directness, reason };
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------ persistence ------------------------------ */

/**
 * Read one competitor's site, score how directly they compete, and store
 * their handles with the verdict. Returns the updated row, or the row as it
 * came in when anything fails: a rival we couldn't enrich is still watched.
 */
export async function enrichCompetitor(
  repo: Repo,
  business: Business,
  competitor: Competitor,
  opts: {
    ownServices?: { name: string; price_cents: number | null }[];
    brief?: Pick<BusinessBrief, "lexicon"> | null;
    fetchHtml?: (url: string) => Promise<string>;
    distanceMiles?: number | null;
    category?: string | null;
    reviewCount?: number | null;
    /** A read already done (the seed reads sites before choosing). */
    site?: RivalSiteRead | null;
  } = {},
): Promise<Competitor> {
  try {
    const ownServices = opts.ownServices ?? (await repo.listServices(business.id));
    const brief = opts.brief !== undefined ? opts.brief : await repo.getBusinessBrief(business.id).catch(() => null);
    const site =
      opts.site !== undefined
        ? opts.site
        : competitor.website
          ? await readRivalSite(competitor.website, { fetchHtml: opts.fetchHtml, category: business.category })
          : null;
    const { directness, reason } = scoreDirectness({
      ownServices,
      ownCategory: business.category,
      ownPriceBand: business.price_band,
      ownLexicon: brief?.lexicon ?? [],
      ownMarket: business.market,
      rival: {
        name: competitor.name,
        category: opts.category,
        distanceMiles: opts.distanceMiles,
        reviewCount: opts.reviewCount,
        site,
      },
    });
    // Handles found on the site win; a site with no social links keeps
    // whatever was already known rather than erasing it.
    // The site fills gaps; a handle the owner typed in Settings always wins,
    // however many times the rival is re-read.
    const social_handles = { ...(site?.handles ?? {}), ...(competitor.social_handles ?? {}) };
    return await repo.updateCompetitor(competitor.id, {
      social_handles,
      directness,
      directness_reason: reason,
    });
  } catch (err) {
    console.warn("[intel] competitor enrichment failed (non-fatal):", (err as Error).message);
    return competitor;
  }
}

/** Below this a rival is a neighbour, not a competitor for the same customer.
 * The same bar four-signals.ts and the social read apply. */
export const DIRECT_MIN = 0.5;
/** A rival under the bar is re-read this often: sites change, and so does the scorer. */
const RESCORE_DAYS = 7;
/** Site reads per business per run, so a re-score never crowds out the day's reads. */
const RESCORE_CAP = 5;

/**
 * Re-read the rivals that scored under the bar, at most weekly. A rival that
 * was mis-scored (the online catalog case above) stays unread forever
 * otherwise: nothing of theirs is scraped, so nothing ever changes the
 * verdict. Returns the rows as they now stand.
 */
export async function rescoreRivals(repo: Repo, business: Business, competitors: Competitor[]): Promise<Competitor[]> {
  const under = competitors.filter((c) => typeof c.directness === "number" && c.directness < DIRECT_MIN && c.website);
  if (under.length === 0) return competitors;
  let recent = new Set<string>();
  try {
    const reads = await repo.listCompetitorReads(business.id, { sinceDays: RESCORE_DAYS });
    recent = new Set(reads.filter((r) => r.kind === "site").map((r) => r.competitor_id));
  } catch {
    /* no reads table yet: re-score anyway */
  }
  const due = under.filter((c) => !recent.has(c.id)).slice(0, RESCORE_CAP);
  if (due.length === 0) return competitors;
  const [ownServices, brief] = await Promise.all([
    repo.listServices(business.id).catch(() => []),
    repo.getBusinessBrief(business.id).catch(() => null),
  ]);
  const updated = new Map<string, Competitor>();
  for (const c of due) {
    const row = await enrichCompetitor(repo, business, c, { ownServices, brief });
    updated.set(c.id, row);
    try {
      await repo.upsertCompetitorReads([
        {
          competitor_id: c.id,
          business_id: business.id,
          kind: "site",
          value: row.directness,
          rating: null,
          summary: row.directness_reason ?? "Site re-read",
          raw: { rescored: true, before: c.directness, after: row.directness },
        },
      ]);
    } catch (err) {
      console.warn(`[intel] site read for ${c.name} not stored (non-fatal):`, (err as Error).message);
    }
  }
  return competitors.map((c) => updated.get(c.id) ?? c);
}
