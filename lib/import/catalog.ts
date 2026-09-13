import { probeStorefrontProducts } from "./website";
import { fetchViaReader, isRefusal } from "@/lib/import/reader";

/**
 * A storefront's own catalog, used to price what the site names.
 *
 * eskiin's import came back with seven products and no prices. Its Shopify
 * catalog was public the whole time, 31 products with prices, but two things
 * threw them away: the model read the product names off landing-page copy
 * ("Double Bundle (2 Showerheads + 6 Replacement Filters)") with no prices,
 * and that list replaced everything the store's JSON had priced. A bundle
 * tier is not a product in Shopify either: "Double" is a variant of "Filtered
 * Showerhead Bundle", priced on its own.
 *
 * So the catalog is kept as products WITH their priced variants, and names
 * from anywhere are priced against it by the words they share. A weak match,
 * or two matches that tie on different prices, leaves the price empty: an ad
 * that quotes the wrong price is worse than a row the owner fills in.
 */

export interface CatalogVariant {
  /** The variant's distinguishing option ("Double"), colours and "Default
   * Title" removed; empty when only colours differ. */
  label: string;
  price: string;
}

export interface CatalogProduct {
  name: string;
  handle: string | null;
  /** The lowest variant price — what "from" means on the product page. */
  price: string;
  variants: CatalogVariant[];
}

export interface CatalogMatchOptions {
  /** The store's own name; its words say nothing about which product. */
  brand?: string;
  /** Product handles the crawled pages link to. A tie between two catalog
   * products goes to the one the site is actually selling on its pages. */
  linkedHandles?: Set<string>;
}

/** Not something a customer buys as a product. */
const NOT_A_PRODUCT = /shipping protection|route protection|package protection|gift ?card|e-?book|\binsurance\b|donation|\bsample\b|^free\b/i;
/** Variant options that change the finish, not the offer. */
const FINISH = /^(default title|chrome|black|white|gold|rose gold|silver|brushed nickel|nickel|matte black|brass|bronze|copper|clear|pink|blue|green|gr[ae]y|beige|cream|natural)$/i;
/** Bundle tiers: matched against variant labels, not product titles. */
const TIER = /^(basic|single|double|triple|family|duo|trio|quad)$/;
const FILLER = new Set([
  "the", "and", "for", "with", "of", "a", "an", "in", "on", "your", "our", "new", "limited", "edition", "plus", "pack", "set",
]);
const LINKED_BOOST = 0.3;
const MIN_SCORE = 0.3;
const TIE_MARGIN = 0.1;

function money(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function stem(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !FILLER.has(w) && !/^\d+$/.test(w) && !/^v\d+$/.test(w) && w !== "gpm");
}

/** The words that identify a product: stemmed, no filler, sizes or versions. */
export function productWords(text: string): Set<string> {
  return new Set(words(text).map(stem));
}

/** "wall mount" and "wallmount" are one word to a catalog. */
function joinedPairs(text: string): Set<string> {
  const ws = words(text);
  const out = new Set<string>();
  for (let i = 0; i + 1 < ws.length; i++) out.add(stem(ws[i] + ws[i + 1]));
  return out;
}

/** Pure: Shopify's public /products.json into priced products. */
export function shopifyCatalog(raw: unknown): CatalogProduct[] {
  const products = (raw as { products?: unknown } | null)?.products;
  if (!Array.isArray(products)) return [];
  const out: CatalogProduct[] = [];
  const seen = new Set<string>();
  for (const item of products) {
    const p = item as { title?: unknown; handle?: unknown; variants?: { title?: unknown; price?: unknown }[] };
    const name = typeof p.title === "string" ? p.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (name.length < 3 || NOT_A_PRODUCT.test(name)) continue;
    const variants: CatalogVariant[] = [];
    for (const v of Array.isArray(p.variants) ? p.variants : []) {
      const price = money(v?.price);
      if (!price) continue;
      const label = String(v?.title ?? "")
        .split("/")
        .map((s) => s.trim())
        .filter((s) => s && !FINISH.test(s))
        .join(" ");
      variants.push({ label, price });
    }
    if (variants.length === 0) continue;
    // Stores re-list the same product for different landing pages; one row.
    const key = [...productWords(name)].sort().join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    const lowest = Math.min(...variants.map((v) => parseFloat(v.price)));
    out.push({
      name,
      handle: typeof p.handle === "string" ? p.handle : null,
      price: money(lowest) ?? variants[0].price,
      variants,
    });
  }
  return out;
}

/** A flat priced list (a crawl's rows) as a catalog to price names against. */
export function asCatalog(rows: { name: string; price?: string }[]): CatalogProduct[] {
  return rows
    .map((r) => ({ name: r.name, price: money(r.price) }))
    .filter((r): r is { name: string; price: string } => Boolean(r.name.trim() && r.price))
    .map((r) => ({ name: r.name, handle: null, price: r.price, variants: [{ label: "", price: r.price }] }));
}

export interface CatalogMatch {
  product: CatalogProduct;
  price: string;
  score: number;
}

/** The catalog product a name means, and its price; null when unsure. */
export function matchCatalog(name: string, catalog: CatalogProduct[], opts: CatalogMatchOptions = {}): CatalogMatch | null {
  const brand = productWords(opts.brand ?? "");
  const all = [...productWords(name)].filter((t) => !brand.has(t));
  const tier = all.find((t) => TIER.test(t)) ?? null;
  const q = new Set(all.filter((t) => !TIER.test(t)));
  if (q.size === 0) return null;
  const qJoined = joinedPairs(name);

  const scored: CatalogMatch[] = [];
  for (const product of catalog) {
    const p = new Set([...productWords(product.name)].filter((t) => !brand.has(t) && !TIER.test(t)));
    if (p.size === 0) continue;
    let overlap = 0;
    let merged = 0;
    for (const t of q) if (p.has(t)) overlap += 1;
    for (const j of qJoined) {
      if (p.has(j)) {
        overlap += 1;
        merged += 1;
      }
    }
    for (const j of joinedPairs(product.name)) {
      if (q.has(j)) {
        overlap += 1;
        merged += 1;
      }
    }
    if (overlap < Math.min(2, q.size)) continue;
    let price = product.price;
    if (tier) {
      const variant = product.variants.find((v) => productWords(v.label).has(tier));
      if (!variant) continue;
      price = variant.price;
    }
    const qn = Math.max(1, q.size - merged);
    const pn = Math.max(1, p.size - merged);
    let score = (overlap * overlap) / (qn * pn);
    if (product.handle && opts.linkedHandles?.has(product.handle)) score += LINKED_BOOST;
    scored.push({ product, price, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (!top || top.score < MIN_SCORE) return null;
  if (second && top.score - second.score < TIE_MARGIN && second.price !== top.price) return null;
  return top;
}

/**
 * Price every row that has no price from the catalog, keep every price that
 * was already there, and (with `append`) add priced catalog products no row
 * named — a store sells more than its landing pages mention.
 */
export function fillCatalogPrices(
  rows: { name: string; price?: string }[],
  catalog: CatalogProduct[],
  opts: CatalogMatchOptions & { append?: number } = {},
): { name: string; price: string }[] {
  const used = new Set<CatalogProduct>();
  const out = rows.map((r) => {
    const match = matchCatalog(r.name, catalog, opts);
    if (match) used.add(match.product);
    const existing = (r.price ?? "").trim();
    return { name: r.name, price: existing || match?.price || "" };
  });
  const room = opts.append ?? 0;
  if (room > 0) {
    const names = new Set(out.map((r) => r.name.trim().toLowerCase()));
    let added = 0;
    for (const product of catalog) {
      if (added >= room) break;
      if (used.has(product) || names.has(product.name.toLowerCase())) continue;
      out.push({ name: product.name, price: product.price });
      names.add(product.name.toLowerCase());
      added += 1;
    }
  }
  return out;
}

/** Product handles the crawled pages link to. */
export function linkedProductHandles(pages: { html: string }[]): Set<string> {
  const out = new Set<string>();
  for (const page of pages) {
    for (const m of page.html.matchAll(/\/products\/([a-z0-9][a-z0-9-]*)/gi)) out.add(m[1].toLowerCase());
  }
  return out;
}

async function fetchJsonDefault(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      accept: "application/json",
    },
    redirect: "follow",
  });
  // A storefront behind a bot wall refuses the JSON too; the reader proxy
  // fetches it from a browser and hands the text back untouched.
  if (isRefusal(new Error(`HTTP ${res.status}`))) return JSON.parse(await fetchViaReader(url, "text"));
  if (!res.ok || !/json/i.test(res.headers.get("content-type") ?? "")) throw new Error(`catalog ${res.status}`);
  return res.json();
}

/**
 * The store's catalog: Shopify's public JSON with variants when the site is a
 * Shopify store, the WooCommerce/Shopify first-price probe otherwise. Never
 * throws; a store that blocks the read returns [].
 */
export async function fetchStorefrontCatalog(
  url: string,
  html: string,
  opts: { fetchJson?: (url: string) => Promise<unknown> } = {},
): Promise<CatalogProduct[]> {
  const origin = new URL(url).origin;
  if (/shopify|\/cdn\/shop\//i.test(html)) {
    try {
      const catalog = shopifyCatalog(await (opts.fetchJson ?? fetchJsonDefault)(`${origin}/products.json?limit=250`));
      if (catalog.length > 0) return catalog;
    } catch {
      /* blocked or not Shopify after all: the generic probe below */
    }
  }
  if (opts.fetchJson) return [];
  try {
    return asCatalog(await probeStorefrontProducts(url, html));
  } catch {
    return [];
  }
}
