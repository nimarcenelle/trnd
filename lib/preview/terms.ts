import { CATEGORY_CONFIGS } from "@/lib/signals/category-terms";
import type { SiteImport } from "@/lib/import/website";

/**
 * What to measure for a business we have never met, derived from its own
 * site — no model call, because the snapshot has to land in seconds and a
 * menu is better evidence than a guess anyway.
 *
 * Their own service names come first: "brow lamination" measured in their
 * metro is the line that makes an owner sit up, and it is only possible
 * because we read it off their page. Category terms fill in behind, so a
 * thin site still produces a real read.
 */

/** Menu nouns that measure nothing on their own. */
const GENERIC = new Set(
  "special specials menu service services package packages option options item items combo deal deals gift card certificate consultation consult appointment session sessions class classes membership hour hours day week month".split(
    " ",
  ),
);

const MAX_WORDS = 4;

/** A service name as a searchable phrase, or null when it isn't one. */
export function termFromService(name: string): string | null {
  const cleaned = name
    .toLowerCase()
    .replace(/\$\s*[\d.,]+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 4) return null;
  const words = cleaned.split(" ").filter((w) => w.length > 1);
  if (words.length === 0 || words.length > MAX_WORDS) return null;
  // A name made only of generic menu nouns ("gift card", "consultation")
  // measures the category, not this business — those come from the lexicon.
  if (words.every((w) => GENERIC.has(w))) return null;
  return words.join(" ");
}

export interface PreviewTerms {
  /** Terms read off their own menu — the ones worth leading with. */
  own: string[];
  /** Category terms, so a thin site still gets a real demand read. */
  category: string[];
  all: string[];
}

export function previewTerms(site: SiteImport, cap = 6): PreviewTerms {
  const seen = new Set<string>();
  const own: string[] = [];
  for (const service of site.services ?? []) {
    const term = termFromService(service.name);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    own.push(term);
    if (own.length >= cap) break;
  }
  const config = CATEGORY_CONFIGS.find((c) => c.category === site.category);
  const category: string[] = [];
  for (const term of config?.watchTerms ?? []) {
    if (seen.has(term)) continue;
    seen.add(term);
    category.push(term);
  }
  // Their own terms lead; the category fills the rest of the budget.
  const all = [...own, ...category].slice(0, Math.max(cap, 4));
  return { own, category, all };
}
