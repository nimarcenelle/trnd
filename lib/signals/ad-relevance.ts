/**
 * Relevance filter for Meta Ad Library reads.
 *
 * The Ad Library is searched by keyword, so "bike tune up" returns a
 * motorcycle dealer's tune-up ad, "hydraulic brake" returns whoever's
 * copy mentions brakes, and any term can return foreign-language spam
 * that games the index. Shown raw, that sample tells a NYC bike shop its
 * competitors are a Royal Enfield dealer and an Arabic streaming site —
 * and one glance at that ends the owner's trust in every other number.
 *
 * An ad counts as a competitor read only when its copy actually speaks
 * to the term: written in the business's script, and hitting the term's
 * core words (all of them for short terms, two-thirds for longer ones).
 * Precision over recall — a missed rival costs nothing; a fake one costs
 * the product's credibility.
 */

export interface AdLike {
  advertiser: string;
  snippet: string;
}

/** Words that carry no product meaning in a search term. */
const GENERIC = new Set([
  "service", "services", "shop", "store", "near", "local", "best", "cheap", "price",
  "prices", "cost", "top", "good", "new", "the", "and", "for", "with", "your", "nyc",
]);

function coreTokens(term: string, geoWords: string[]): string[] {
  const geo = new Set(geoWords.flatMap((g) => g.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean));
  return [...new Set(
    term
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !GENERIC.has(t) && !geo.has(t)),
  )];
}

/** Words a term and an ad use for the same thing. Small on purpose: only
 * families where the miss is certain, not a thesaurus. */
const SYNONYMS: Record<string, string[]> = {
  bike: ["bicycle", "cycling", "cyclist", "ebike"],
  ebike: ["bike", "bicycle", "electric bike"],
  bicycle: ["bike", "cycling", "ebike"],
  auto: ["car", "vehicle", "automotive"],
  car: ["auto", "vehicle"],
  vehicle: ["car", "auto"],
  kids: ["children", "child", "kid"],
  kid: ["children", "child", "kids"],
};

/** "bike" hits "ebikes" and "bicycle"; "assembl" hits "assembled"; "tune"
 * hits "tune-up". */
function hits(text: string, token: string): boolean {
  const forms = [token, ...(SYNONYMS[token] ?? [])];
  return forms.some((f) => (f.length >= 4 ? text.includes(f) : new RegExp(`\\b${f}\\b`).test(text)));
}

/** True when the copy is mostly Latin-script — a term read for a US
 * business cannot be answered by an ad written in another alphabet. */
export function isLatinText(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length;
  return latin / letters.length >= 0.7;
}

export function isRelevantAd(ad: AdLike, term: string, geoWords: string[] = []): boolean {
  const text = `${ad.advertiser} ${ad.snippet}`.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  if (!isLatinText(ad.snippet)) return false;
  const core = coreTokens(term, geoWords);
  if (core.length === 0) return true;
  const hit = core.filter((t) => hits(text, t)).length;
  const needed = core.length <= 2 ? core.length : Math.ceil((core.length * 2) / 3);
  return hit >= needed;
}

export function relevantAds<T extends AdLike>(ads: T[], term: string, geoWords: string[] = []): T[] {
  return ads.filter((ad) => isRelevantAd(ad, term, geoWords));
}

export interface AdReadAssessment {
  /** Ads from the sample that actually speak to the term. */
  ads: AdLike[];
  /** Sample ads that were keyword noise (other industries, spam). */
  unrelated: number;
  /** Whether the read can stand in for local competition at all. Two or
   * more relevant ads in the sample, or a majority, is a read; one stray
   * hit in a page of motorcycles is not. No sample at all leaves the count
   * usable — there was nothing to contradict it. */
  countUsable: boolean;
  /** The competitor count the score should use: the keyword total scaled
   * by the relevant share of the sample ("≈20 of 49 matches"). Equals the
   * raw total when there was no sample; null when unusable. */
  count: number | null;
}

export function assessAdRead(
  ads: AdLike[] | null | undefined,
  term: string,
  geoWords: string[] = [],
  total: number | null = null,
): AdReadAssessment {
  const sample = ads ?? [];
  const keep = relevantAds(sample, term, geoWords);
  const unrelated = sample.length - keep.length;
  const countUsable = sample.length === 0 ? true : keep.length >= 2 || keep.length * 2 >= sample.length;
  let count: number | null = null;
  if (countUsable && typeof total === "number") {
    count = sample.length === 0 ? total : Math.max(keep.length, Math.round((total * keep.length) / sample.length));
  }
  return { ads: keep, unrelated, countUsable, count };
}
