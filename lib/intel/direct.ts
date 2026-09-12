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
  rival: {
    name: string;
    category?: string | null;
    distanceMiles?: number | null;
    site?: RivalSiteRead | null;
    reviewCount?: number | null;
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

/**
 * 0..1, how directly a rival competes for the same customer, with the one
 * sentence an owner reads for why. Pure: every input arrives already read.
 */
export function scoreDirectness(input: DirectnessInput): { directness: number; reason: string } {
  const { rival } = input;
  const ownItems = [...input.ownServices.map((s) => s.name), ...input.ownLexicon].filter((s) => s.trim());
  const distance = distancePhrase(rival.distanceMiles);

  // Close enough to share a walk-in customer, or far enough that few
  // would cross town for the same drink.
  let distanceAdj = 0;
  if (typeof rival.distanceMiles === "number") {
    if (rival.distanceMiles <= 2) distanceAdj = 0.1;
    else if (rival.distanceMiles > 8) distanceAdj = -0.1;
  }

  const site = rival.site ?? null;
  if (!site) {
    // The name and Places category still hint ("Espresso Bar"), but a
    // guess from a name must never outrank a menu we actually read.
    const hint = menuOverlap(ownItems, `${rival.name} ${rival.category ?? ""}`);
    const directness = clamp(Math.min(UNREAD_DIRECTNESS_CAP, 0.3 + 0.3 * hint.coverage + distanceAdj));
    const where = distance ? `Same category, ${distance}` : "Same category";
    return {
      directness: round2(directness),
      reason: `${where}, but we couldn't read their website, so how closely they compete is a rough guess.`,
    };
  }

  const rivalText = `${site.services.map((s) => s.name).join("\n")}\n${site.text}`;
  const overlap = menuOverlap(ownItems, rivalText);
  const focus = rivalFocus(site.services, overlap.vocab);
  const menuScore = focus === null ? overlap.coverage : 0.6 * overlap.coverage + 0.4 * focus;

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
  if (menuScore >= 0.45 && items.length > 0) lead = `Sells the same ${listPhrase(items)} you do`;
  else if (menuScore >= 0.2 && items.length > 0) lead = `Overlaps with some of your menu, like ${listPhrase(items)}`;
  else if (rival.category) {
    lead = `Same category, but little of your menu shows up at this ${rival.category.toLowerCase().replace(/[—–→]/g, " ")}`;
  } else lead = "Same category, but little of your menu shows up on their site";

  const price =
    bandGap === 0
      ? "at your prices"
      : bandGap === null
        ? null
        : Math.abs(bandGap) >= 2
          ? `at a very different price point (${site.priceBand} to your ${input.ownPriceBand})`
          : bandGap > 0
            ? "priced a step above you"
            : "priced a step below you";

  const reason = `${lead}${price ? ` ${price}` : ""}${distance ? `, ${distance}` : ""}.`;
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
    const social_handles =
      site && Object.keys(site.handles).length > 0 ? site.handles : competitor.social_handles ?? {};
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
