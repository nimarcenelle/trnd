import type { Repo } from "@/lib/db/repo";
import type { Business, NewStoreRead, Service, ServiceVariant } from "@/lib/db/types";

import {
  fetchCosts,
  fetchDiscountCodes,
  fetchOrders,
  fetchPriceRules,
  fetchProducts,
  shopifyFetcher,
  type ShopifyFetch,
  type ShopifyOrder,
  type ShopifyPriceRule,
  type ShopifyProduct,
} from "./client";

/**
 * The brand's own store, into the catalog and the dossier.
 *
 * The catalog TRND writes briefs from used to be whatever the site crawl
 * and the public products.json gave: names and prices. The store knows
 * more: what each product costs the brand, which variants exist and are
 * in stock, how many orders the last 30 days held and how many were first
 * orders, and which discount codes are live. A brief that knows the margin
 * knows what an offer test can afford; one that knows the codes does not
 * write an offer the checkout already gives away.
 */

export const ORDER_WINDOW_DAYS = 30;

const cents = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) ? n : null;
};

const stripHtml = (html: string | null | undefined): string | null => {
  const t = (html ?? "")
    .replace(/<\/(p|div|li|h\d|tr)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.slice(0, 400) : null;
};

export interface CatalogRow {
  external_id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  cost_cents: number | null;
  in_stock: boolean | null;
  variants: ServiceVariant[];
}

/** Pure: products and their costs into catalog rows. The product's price is
 * its lowest variant's, the cost the lowest priced variant's cost, stock
 * true when any variant is purchasable. */
export function toCatalogRows(products: ShopifyProduct[], costs: Map<number, number | null>): CatalogRow[] {
  const out: CatalogRow[] = [];
  for (const p of products) {
    if (p.status && p.status !== "active") continue;
    const variants: ServiceVariant[] = p.variants.map((v) => {
      const tracked = v.inventory_management === "shopify";
      const in_stock = tracked ? (v.inventory_quantity ?? 0) > 0 || v.inventory_policy === "continue" : null;
      const cost = v.inventory_item_id !== undefined ? (costs.get(v.inventory_item_id) ?? null) : null;
      return { name: v.title === "Default Title" ? "" : v.title, price_cents: cents(v.price), cost_cents: cents(cost), in_stock };
    });
    const priced = variants.filter((v) => v.price_cents !== null).sort((a, b) => (a.price_cents as number) - (b.price_cents as number));
    const lead = priced[0] ?? variants[0];
    const stocks = variants.map((v) => v.in_stock).filter((s): s is boolean => s !== null);
    out.push({
      external_id: String(p.id),
      name: p.title.trim(),
      description: stripHtml(p.body_html),
      price_cents: lead?.price_cents ?? null,
      cost_cents: lead?.cost_cents ?? null,
      in_stock: stocks.length ? stocks.some(Boolean) : null,
      variants: variants.filter((v) => v.name || variants.length > 1),
    });
  }
  return out;
}

/** Pure: the last 30 days of orders, new customers against returning. A
 * customer whose order count on the order is one placed their first order
 * in the window. Cancelled and unpaid orders are left out. */
export function summarizeOrders(orders: ShopifyOrder[]): Pick<NewStoreRead, "orders_30d" | "new_customers_30d" | "returning_customers_30d" | "revenue_30d_cents" | "aov_cents"> {
  const kept = orders.filter((o) => !o.cancelled_at && (o.financial_status === undefined || /paid|partially_refunded|authorized/.test(o.financial_status)));
  const newCustomers = new Set<number>();
  const returning = new Set<number>();
  let revenue = 0;
  for (const o of kept) {
    revenue += cents(o.total_price) ?? 0;
    if (!o.customer) continue;
    if ((o.customer.orders_count ?? 1) <= 1) newCustomers.add(o.customer.id);
    else returning.add(o.customer.id);
  }
  for (const id of newCustomers) returning.delete(id);
  return {
    orders_30d: kept.length,
    new_customers_30d: newCustomers.size,
    returning_customers_30d: returning.size,
    revenue_30d_cents: revenue,
    aov_cents: kept.length > 0 ? Math.round(revenue / kept.length) : null,
  };
}

/** Pure: the price rules live today, with their codes, as one line each. */
export function liveDiscounts(rules: ShopifyPriceRule[], codesByRule: Map<number, string[]>, now = new Date()): NewStoreRead["discount_codes"] {
  const out: NewStoreRead["discount_codes"] = [];
  for (const r of rules) {
    if (r.starts_at && new Date(r.starts_at).getTime() > now.getTime()) continue;
    if (r.ends_at && new Date(r.ends_at).getTime() < now.getTime()) continue;
    const value = Math.abs(Number(r.value));
    const summary = r.value_type === "percentage" ? `${value}% off` : `$${value.toFixed(value % 1 ? 2 : 0)} off`;
    for (const code of codesByRule.get(r.id) ?? []) out.push({ code, summary: `${summary} (${r.title})`, ends_at: r.ends_at ?? null });
  }
  return out.slice(0, 20);
}

export interface ShopifySyncOptions {
  get?: ShopifyFetch;
  now?: Date;
}

export interface ShopifySyncResult {
  products: number;
  created: number;
  updated: number;
  orders: number | null;
  skipped?: string;
}

/** Pull the store, write the catalog and the day's store read. Never throws. */
export async function syncShopify(repo: Repo, business: Business, opts: ShopifySyncOptions = {}): Promise<ShopifySyncResult> {
  const now = opts.now ?? new Date();
  try {
    const connection = await repo.getConnection(business.id, "shopify");
    if (!connection) return { products: 0, created: 0, updated: 0, orders: null, skipped: "no Shopify connection" };
    if (connection.status !== "connected" || !connection.account_id) return { products: 0, created: 0, updated: 0, orders: null, skipped: `Shopify connection is ${connection.status}` };
    const get = opts.get ?? shopifyFetcher(connection.account_id, connection.access_token);

    const products = await fetchProducts(get);
    const costs = await fetchCosts(get, products.flatMap((p) => p.variants.map((v) => v.inventory_item_id).filter((n): n is number => typeof n === "number"))).catch((err: Error) => {
      console.warn(`[shopify] costs for ${business.id} not read (scope read_inventory?):`, err.message);
      return new Map<number, number | null>();
    });
    const rows = toCatalogRows(products, costs);

    const existing = await repo.listServices(business.id);
    const byExternal = new Map(existing.filter((s) => s.external_id).map((s) => [s.external_id as string, s]));
    const byName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]));
    let created = 0;
    let updated = 0;
    const toCreate: Omit<Service, "id">[] = [];
    for (const row of rows) {
      const match = byExternal.get(row.external_id) ?? byName.get(row.name.toLowerCase());
      if (match) {
        await repo.updateService(match.id, {
          price_cents: row.price_cents ?? match.price_cents,
          cost_cents: row.cost_cents,
          in_stock: row.in_stock,
          external_id: row.external_id,
          variants: row.variants,
          description: match.description ?? row.description,
        });
        updated += 1;
      } else {
        toCreate.push({ business_id: business.id, name: row.name, description: row.description, price_cents: row.price_cents, is_active: true, in_stock: row.in_stock, cost_cents: row.cost_cents, external_id: row.external_id, variants: row.variants });
      }
    }
    if (toCreate.length) {
      await repo.createServices(toCreate);
      created = toCreate.length;
    }

    let orders: number | null = null;
    try {
      const since = new Date(now.getTime() - ORDER_WINDOW_DAYS * 86_400_000);
      const list = await fetchOrders(get, since);
      const summary = summarizeOrders(list);
      orders = summary.orders_30d;
      let discounts: NewStoreRead["discount_codes"] = [];
      try {
        const rules = await fetchPriceRules(get);
        const codes = new Map<number, string[]>();
        for (const r of rules.slice(0, 30)) codes.set(r.id, await fetchDiscountCodes(get, r.id));
        discounts = liveDiscounts(rules, codes, now);
      } catch (err) {
        console.warn(`[shopify] discounts for ${business.id} not read (scope read_discounts?):`, (err as Error).message);
      }
      await repo.upsertStoreRead({ business_id: business.id, captured_on: now.toISOString().slice(0, 10), provider: "shopify", ...summary, discount_codes: discounts, raw: null });
    } catch (err) {
      console.warn(`[shopify] orders for ${business.id} not read (scope read_orders?):`, (err as Error).message);
    }
    return { products: rows.length, created, updated, orders };
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`[shopify] business ${business.id} failed:`, message);
    return { products: 0, created: 0, updated: 0, orders: null, skipped: message };
  }
}

/** Daily: every connected store, one at a time. */
export async function runShopifySync(repo: Repo, opts: ShopifySyncOptions = {}): Promise<({ businessId: string } & ShopifySyncResult)[]> {
  const out: ({ businessId: string } & ShopifySyncResult)[] = [];
  let businesses: Business[];
  try {
    businesses = await repo.listAllBusinesses();
  } catch (err) {
    console.warn("[shopify] listing businesses failed:", (err as Error).message);
    return out;
  }
  for (const business of businesses) {
    const result = await syncShopify(repo, business, opts);
    if (result.skipped !== "no Shopify connection") out.push({ businessId: business.id, ...result });
  }
  return out;
}

/** "$68 · 62% margin" for a catalog line; null when the cost is unknown. */
export function marginPct(service: Pick<Service, "price_cents" | "cost_cents">): number | null {
  const price = service.price_cents;
  const cost = service.cost_cents;
  if (typeof price !== "number" || typeof cost !== "number" || price <= 0) return null;
  return Math.round(((price - cost) / price) * 100);
}
