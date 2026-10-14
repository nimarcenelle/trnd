import type { SiteChangeKind } from "@/lib/db/types";

/**
 * Pure: what a competitor's website says and sells, as a snapshot we can
 * compare day to day, and the material changes between two snapshots. Visual
 * redesigns are out of scope; what matters is what they sell, at what price,
 * what they promote and how they describe themselves.
 */

export interface SiteProduct {
  id: string;
  title: string;
  /** Lowest variant price, in the store's currency. */
  price: number | null;
  /** The crossed-out price when on sale. */
  compare_at: number | null;
  available: boolean;
  url: string | null;
}

export interface SiteSnapshot {
  title: string;
  description: string;
  /** The page's headings, hero first. */
  headlines: string[];
  /** Offer lines: announcement bars, "% off", free shipping, bundles. */
  promos: string[];
  nav: string[];
  products: SiteProduct[];
  /** True when products came from a full catalog (Shopify products.json), so a missing one is really gone. */
  catalog: boolean;
  text_hash: string;
}

export interface SiteDiff {
  kind: SiteChangeKind;
  title: string;
  before: string | null;
  after: string | null;
  url: string | null;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#039;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const uniq = (xs: string[]) => [...new Map(xs.filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];

const OFFER =
  /(\d{1,2}\s?% off|save \$?\d+|\$\d+ off|free (?:shipping|delivery|gift|returns)|buy one|bogo|bundle|sale\b|limited[- ]time|ends (?:today|tonight|soon|sunday|monday)|subscribe (?:&|and) save|first order|code [A-Z0-9]{3,})/i;

/** djb2, enough to tell "the page text changed" without storing it. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Offer lines in some text: short sentences that name a discount or an incentive. */
export function promoLines(text: string): string[] {
  return uniq(
    text
      .split(/(?<=[.!?|•·])\s+|\n+/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length >= 6 && l.length <= 140 && OFFER.test(l)),
  ).slice(0, 12);
}

/** Products a page declares in JSON-LD (most non-Shopify stores). */
function jsonLdProducts(html: string, base: string): SiteProduct[] {
  const out: SiteProduct[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const type = o["@type"];
    if ((type === "Product" || (Array.isArray(type) && type.includes("Product"))) && typeof o.name === "string") {
      const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
      const offer = offers && typeof offers === "object" ? (offers as Record<string, unknown>) : {};
      const price = Number(offer.price ?? offer.lowPrice);
      const url = typeof o.url === "string" ? new URL(o.url, base).toString() : null;
      out.push({
        id: url ?? o.name,
        title: o.name,
        price: Number.isFinite(price) && price > 0 ? price : null,
        compare_at: null,
        available: !/OutOfStock/i.test(String(offer.availability ?? "")),
        url,
      });
    }
    for (const k of ["@graph", "itemListElement", "item", "mainEntity"]) if (k in o) visit(o[k]);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      // malformed JSON-LD is common; skip it
    }
  }
  return out;
}

/** Shopify's public /products.json, when the store has one. */
export function shopifyProducts(json: unknown, base: string): SiteProduct[] {
  const products = (json as { products?: unknown[] })?.products;
  if (!Array.isArray(products)) return [];
  return products.flatMap((p) => {
    const o = p as Record<string, unknown>;
    if (typeof o.title !== "string") return [];
    const variants = (Array.isArray(o.variants) ? o.variants : []) as Record<string, unknown>[];
    const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
    const price = prices.length ? Math.min(...prices) : null;
    const cheapest = variants.find((v) => Number(v.price) === price);
    const compare = cheapest ? Number(cheapest.compare_at_price) : NaN;
    return [
      {
        id: String(o.handle ?? o.id),
        title: o.title,
        price,
        compare_at: Number.isFinite(compare) && price !== null && compare > price ? compare : null,
        available: variants.some((v) => v.available !== false),
        url: o.handle ? `${base.replace(/\/$/, "")}/products/${o.handle}` : null,
      },
    ];
  });
}

/** A snapshot from the homepage HTML (or the reader's markdown when the HTML was empty) and the catalog, if any. */
export function snapshotFrom(page: { html: string | null; markdown: string | null; base: string; catalog: SiteProduct[] | null }): SiteSnapshot {
  const { html, markdown, base } = page;
  let title = "";
  let description = "";
  let headlines: string[] = [];
  let nav: string[] = [];
  let promos: string[] = [];
  let text = "";
  let products: SiteProduct[] = [];
  if (html) {
    title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "").trim();
    const body = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ");
    headlines = uniq([...body.matchAll(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => clean(m[2])).filter((h) => h.length > 2 && h.length < 160)).slice(0, 10);
    const navBlock = body.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? "";
    nav = uniq([...navBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => clean(m[1])).filter((t) => t.length > 1 && t.length < 40)).slice(0, 20);
    const bars = [...body.matchAll(/<(div|p|section|aside|a)[^>]*(?:class|id)=["'][^"']*(?:announcement|promo|top-?bar|banner|marquee)[^"']*["'][^>]*>([\s\S]{0,600}?)<\/\1>/gi)]
      .map((m) => clean(m[2]))
      .filter((t) => t.length > 4 && t.length < 160);
    text = clean(body);
    promos = uniq([...bars, ...promoLines(text)]).slice(0, 12);
    products = jsonLdProducts(html, base);
  } else if (markdown) {
    const lines = markdown.split("\n");
    title = lines.find((l) => /^Title:/.test(l))?.replace(/^Title:\s*/, "") ?? "";
    headlines = uniq(lines.filter((l) => /^#{1,2}\s/.test(l)).map((l) => l.replace(/^#+\s*/, "").replace(/[*_`[\]]/g, "").trim())).slice(0, 10);
    text = markdown.replace(/\s+/g, " ");
    promos = promoLines(markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
  }
  const catalog = page.catalog && page.catalog.length ? page.catalog : null;
  return {
    title,
    description,
    headlines,
    promos,
    nav,
    products: (catalog ?? products).slice(0, 400),
    catalog: Boolean(catalog),
    text_hash: hash(text.slice(0, 20_000)),
  };
}

const money = (n: number | null) => (n === null ? "?" : `$${n % 1 ? n.toFixed(2) : n}`);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$]+/g, " ").trim();

/**
 * The material changes from one snapshot to the next. Many products at once
 * (a catalog reshuffle, a new collection) collapse into one line, so a big
 * day reads as one event, not forty.
 */
export function diffSnapshots(prev: SiteSnapshot, next: SiteSnapshot): SiteDiff[] {
  const out: SiteDiff[] = [];
  const before = new Map(prev.products.map((p) => [p.id, p]));
  const after = new Map(next.products.map((p) => [p.id, p]));

  const added = next.products.filter((p) => !before.has(p.id));
  // Without a full catalog on both sides, a product missing from the homepage hasn't necessarily gone.
  const dropped = prev.catalog && next.catalog ? prev.products.filter((p) => !after.has(p.id)) : [];
  const group = (list: SiteProduct[], kind: "new_product" | "dropped_product", verb: string) => {
    if (!list.length) return;
    if (list.length <= 3) {
      for (const p of list) out.push({ kind, title: `${verb}: ${p.title}`, before: null, after: p.price !== null ? money(p.price) : null, url: p.url });
    } else {
      out.push({ kind, title: `${list.length} products ${kind === "new_product" ? "added" : "dropped"}`, before: null, after: list.slice(0, 6).map((p) => p.title).join(", "), url: null });
    }
  };
  group(added, "new_product", "New product");
  group(dropped, "dropped_product", "Dropped");

  const sales: SiteDiff[] = [];
  const prices: SiteDiff[] = [];
  for (const p of next.products) {
    const was = before.get(p.id);
    if (!was) continue;
    if (p.compare_at && !was.compare_at) sales.push({ kind: "sale_started", title: `On sale: ${p.title}`, before: money(p.compare_at), after: money(p.price), url: p.url });
    else if (!p.compare_at && was.compare_at) sales.push({ kind: "sale_ended", title: `Sale ended: ${p.title}`, before: money(was.price), after: money(p.price), url: p.url });
    else if (p.price !== null && was.price !== null && Math.abs(p.price - was.price) >= Math.max(1, was.price * 0.02))
      prices.push({ kind: p.price > was.price ? "price_up" : "price_down", title: `${p.price > was.price ? "Price up" : "Price down"}: ${p.title}`, before: money(was.price), after: money(p.price), url: p.url });
  }
  const collapse = (list: SiteDiff[]) => {
    if (list.length <= 4) return out.push(...list);
    const byKind = new Map<SiteChangeKind, SiteDiff[]>();
    for (const d of list) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
    for (const [kind, ds] of byKind) {
      const label = { sale_started: "products went on sale", sale_ended: "sales ended", price_up: "prices went up", price_down: "prices went down" }[kind as string] ?? "changes";
      out.push({ kind, title: `${ds.length} ${label}`, before: null, after: ds.slice(0, 5).map((d) => `${d.title.replace(/^[^:]+:\s*/, "")} ${d.before ?? ""}→${d.after ?? ""}`).join("; "), url: null });
    }
  };
  collapse(sales);
  collapse(prices);

  const prevPromos = new Set(prev.promos.map(norm));
  const nextPromos = new Set(next.promos.map(norm));
  for (const p of next.promos.filter((x) => !prevPromos.has(norm(x))).slice(0, 4)) out.push({ kind: "promo_added", title: "New promotion", before: null, after: p, url: null });
  for (const p of prev.promos.filter((x) => !nextPromos.has(norm(x))).slice(0, 2)) out.push({ kind: "promo_removed", title: "Promotion removed", before: p, after: null, url: null });

  // Messaging: the hero headline, the page title, or the meta description.
  const hero = (s: SiteSnapshot) => s.headlines[0] ?? "";
  if (hero(prev) && hero(next) && norm(hero(prev)) !== norm(hero(next))) out.push({ kind: "message_changed", title: "New homepage headline", before: hero(prev), after: hero(next), url: null });
  if (prev.description && next.description && norm(prev.description) !== norm(next.description))
    out.push({ kind: "message_changed", title: "New site description", before: prev.description, after: next.description, url: null });

  return out;
}
