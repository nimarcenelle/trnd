/**
 * Shopify Admin API, read with a custom app's access token. The owner
 * makes a custom app in their admin (Settings, Apps, Develop apps), gives
 * it read scopes for products, inventory, orders and discounts, and pastes
 * the token. No OAuth, no app review, one store per brand. Plain fetch.
 */

export const SHOPIFY_API_VERSION = "2025-07";
const PAGE = 250;
/** 30 days of orders at 250 a page: a store past this is not the customer. */
const MAX_ORDER_PAGES = 12;

export interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  inventory_item_id?: number;
  inventory_quantity?: number;
  inventory_management?: string | null;
  inventory_policy?: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string | null;
  status?: string;
  variants: ShopifyVariant[];
}

export interface ShopifyOrder {
  id: number;
  created_at: string;
  total_price: string;
  customer?: { id: number; orders_count?: number } | null;
  cancelled_at?: string | null;
  financial_status?: string;
}

export interface ShopifyPriceRule {
  id: number;
  title: string;
  value_type: "percentage" | "fixed_amount";
  value: string;
  starts_at: string | null;
  ends_at: string | null;
}

export type ShopifyFetch = (path: string) => Promise<{ body: unknown; next: string | null }>;

/** The store's domain as Shopify wants it: brand.myshopify.com. */
export function normalizeShop(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return s;
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) return `${s}.myshopify.com`;
  return null;
}

function nextFromLink(header: string | null): string | null {
  if (!header) return null;
  const m = /<([^>]+)>;\s*rel="next"/.exec(header);
  if (!m) return null;
  const u = new URL(m[1]);
  return `${u.pathname}${u.search}`;
}

export function shopifyFetcher(shop: string, token: string): ShopifyFetch {
  return async (path) => {
    const res = await fetch(`https://${shop}${path}`, { headers: { "X-Shopify-Access-Token": token, accept: "application/json" } });
    if (!res.ok) throw new Error(`shopify ${path.split("?")[0]}: ${res.status}`);
    return { body: await res.json(), next: nextFromLink(res.headers.get("link")) };
  };
}

async function paged<T>(get: ShopifyFetch, first: string, key: string, maxPages: number): Promise<T[]> {
  const out: T[] = [];
  let path: string | null = first;
  for (let page = 0; path && page < maxPages; page++) {
    const { body, next } = await get(path);
    out.push(...(((body as Record<string, unknown>)?.[key] as T[] | undefined) ?? []));
    path = next;
  }
  return out;
}

/** Proves the token works and names the shop. */
export async function fetchShop(get: ShopifyFetch): Promise<{ name: string; domain: string }> {
  const { body } = await get(`/admin/api/${SHOPIFY_API_VERSION}/shop.json?fields=name,domain,myshopify_domain`);
  const shop = (body as { shop?: { name?: string; domain?: string; myshopify_domain?: string } })?.shop;
  if (!shop?.name) throw new Error("shopify shop.json: no shop in the reply");
  return { name: shop.name, domain: shop.domain ?? shop.myshopify_domain ?? "" };
}

export async function fetchProducts(get: ShopifyFetch): Promise<ShopifyProduct[]> {
  return paged<ShopifyProduct>(get, `/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${PAGE}&status=active&fields=id,title,body_html,status,variants`, "products", 8);
}

/** Cost per inventory item id, from the inventory items the variants name. */
export async function fetchCosts(get: ShopifyFetch, inventoryItemIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  const ids = [...new Set(inventoryItemIds.filter((n) => Number.isFinite(n)))];
  for (let i = 0; i < ids.length; i += 100) {
    const { body } = await get(`/admin/api/${SHOPIFY_API_VERSION}/inventory_items.json?ids=${ids.slice(i, i + 100).join(",")}&limit=100`);
    for (const item of ((body as { inventory_items?: { id: number; cost?: string | null }[] })?.inventory_items ?? [])) {
      const cost = item.cost === null || item.cost === undefined || item.cost === "" ? null : Number(item.cost);
      out.set(item.id, cost !== null && Number.isFinite(cost) ? cost : null);
    }
  }
  return out;
}

export async function fetchOrders(get: ShopifyFetch, since: Date): Promise<ShopifyOrder[]> {
  const min = encodeURIComponent(since.toISOString());
  return paged<ShopifyOrder>(
    get,
    `/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=${PAGE}&created_at_min=${min}&fields=id,created_at,total_price,customer,cancelled_at,financial_status`,
    "orders",
    MAX_ORDER_PAGES,
  );
}

export async function fetchPriceRules(get: ShopifyFetch): Promise<ShopifyPriceRule[]> {
  return paged<ShopifyPriceRule>(get, `/admin/api/${SHOPIFY_API_VERSION}/price_rules.json?limit=${PAGE}`, "price_rules", 2);
}

export async function fetchDiscountCodes(get: ShopifyFetch, priceRuleId: number): Promise<string[]> {
  const { body } = await get(`/admin/api/${SHOPIFY_API_VERSION}/price_rules/${priceRuleId}/discount_codes.json?limit=50`);
  return (((body as { discount_codes?: { code: string }[] })?.discount_codes ?? []).map((d) => d.code)).filter(Boolean);
}
