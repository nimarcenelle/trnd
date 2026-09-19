import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { NewBusiness } from "../lib/db/types";
import { normalizeShop, type ShopifyFetch } from "../lib/shopify/client";
import { liveDiscounts, marginPct, summarizeOrders, syncShopify, toCatalogRows } from "../lib/shopify/sync";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-shopify-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { resetStore } = await import("../lib/db/demo/store");

/**
 * The brand's own store into the catalog: cost beside price, variants and
 * stock, the last 30 days of orders new against returning, the live codes.
 */

const bizInput = (ownerId: string): NewBusiness => ({
  owner_id: ownerId,
  name: "eskiin",
  category: "Shower filters",
  city: "",
  region: null,
  country: "US",
  lat: null,
  lng: null,
  radius_miles: 20,
  website: "https://eskiin.com",
  price_band: "$$",
  brand_voice_notes: null,
  photo_urls: [],
  market: "online",
  monthly_ad_spend: null,
  ad_platforms: ["meta"],
});

const products = [
  {
    id: 1,
    title: "Filtered Showerhead",
    body_html: "<p>Removes <b>chlorine</b>.</p>",
    status: "active",
    variants: [
      { id: 11, title: "Chrome", price: "68.00", inventory_item_id: 111, inventory_quantity: 40, inventory_management: "shopify" },
      { id: 12, title: "Black", price: "72.00", inventory_item_id: 112, inventory_quantity: 0, inventory_management: "shopify", inventory_policy: "deny" },
    ],
  },
  { id: 2, title: "Replacement Filter", status: "active", variants: [{ id: 21, title: "Default Title", price: "24.00", inventory_item_id: 211 }] },
  { id: 3, title: "Old bundle", status: "archived", variants: [{ id: 31, title: "Default Title", price: "10.00" }] },
];
const costs = new Map<number, number | null>([
  [111, 22.5],
  [112, 23],
  [211, null],
]);

describe("the catalog from the store", () => {
  it("prices a product at its lowest variant, carries its cost, stock and variants, and drops what is not active", () => {
    const rows = toCatalogRows(products, costs);
    expect(rows.map((r) => r.name)).toEqual(["Filtered Showerhead", "Replacement Filter"]);
    expect(rows[0]).toMatchObject({ external_id: "1", price_cents: 6800, cost_cents: 2250, in_stock: true, description: "Removes chlorine." });
    expect(rows[0].variants).toEqual([
      { name: "Chrome", price_cents: 6800, cost_cents: 2250, in_stock: true },
      { name: "Black", price_cents: 7200, cost_cents: 2300, in_stock: false },
    ]);
    expect(rows[1]).toMatchObject({ price_cents: 2400, cost_cents: null, in_stock: null, variants: [] });
    expect(marginPct({ price_cents: 6800, cost_cents: 2250 })).toBe(67);
    expect(marginPct({ price_cents: 6800, cost_cents: null })).toBeNull();
  });

  it("reads the store domain in any of the ways an owner types it", () => {
    expect(normalizeShop("brand")).toBe("brand.myshopify.com");
    expect(normalizeShop("https://Brand.myshopify.com/admin")).toBe("brand.myshopify.com");
    expect(normalizeShop("brand.com")).toBeNull();
  });
});

describe("the store's last 30 days", () => {
  it("counts paid orders, splits new customers from returning, and leaves cancelled orders out", () => {
    const s = summarizeOrders([
      { id: 1, created_at: "2026-09-01", total_price: "68.00", customer: { id: 1, orders_count: 1 }, financial_status: "paid" },
      { id: 2, created_at: "2026-09-02", total_price: "24.00", customer: { id: 1, orders_count: 2 }, financial_status: "paid" },
      { id: 3, created_at: "2026-09-03", total_price: "68.00", customer: { id: 2, orders_count: 5 }, financial_status: "paid" },
      { id: 4, created_at: "2026-09-04", total_price: "68.00", customer: { id: 3, orders_count: 1 }, financial_status: "paid", cancelled_at: "2026-09-05" },
      { id: 5, created_at: "2026-09-05", total_price: "10.00", customer: null, financial_status: "paid" },
    ]);
    expect(s).toEqual({ orders_30d: 4, new_customers_30d: 1, returning_customers_30d: 1, revenue_30d_cents: 17000, aov_cents: 4250 });
    expect(summarizeOrders([])).toEqual({ orders_30d: 0, new_customers_30d: 0, returning_customers_30d: 0, revenue_30d_cents: 0, aov_cents: null });
  });

  it("keeps only the discount codes live today", () => {
    const now = new Date("2026-09-19T00:00:00Z");
    const codes = liveDiscounts(
      [
        { id: 1, title: "Welcome", value_type: "percentage", value: "-15.0", starts_at: "2026-01-01T00:00:00Z", ends_at: null },
        { id: 2, title: "Summer", value_type: "fixed_amount", value: "-10.0", starts_at: "2026-06-01T00:00:00Z", ends_at: "2026-08-31T00:00:00Z" },
        { id: 3, title: "Black Friday", value_type: "percentage", value: "-30.0", starts_at: "2026-11-20T00:00:00Z", ends_at: null },
      ],
      new Map([
        [1, ["WELCOME15"]],
        [2, ["SUMMER10"]],
        [3, ["BF30"]],
      ]),
      now,
    );
    expect(codes).toEqual([{ code: "WELCOME15", summary: "15% off (Welcome)", ends_at: null }]);
  });
});

describe("syncing a connected store", () => {
  beforeEach(() => resetStore());

  const get: ShopifyFetch = async (p) => {
    if (p.includes("/products.json")) return { body: { products }, next: null };
    if (p.includes("/inventory_items.json")) return { body: { inventory_items: [{ id: 111, cost: "22.50" }, { id: 112, cost: "23" }, { id: 211, cost: null }] }, next: null };
    if (p.includes("/orders.json")) return { body: { orders: [{ id: 1, created_at: "2026-09-10", total_price: "68.00", customer: { id: 1, orders_count: 1 }, financial_status: "paid" }] }, next: null };
    if (p.includes("/price_rules.json")) return { body: { price_rules: [{ id: 1, title: "Welcome", value_type: "percentage", value: "-15.0", starts_at: null, ends_at: null }] }, next: null };
    if (p.includes("/discount_codes.json")) return { body: { discount_codes: [{ code: "WELCOME15" }] }, next: null };
    throw new Error(`unexpected ${p}`);
  };

  it("updates the catalog by store id or name, creates the rest, and writes the day's store read", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    const [crawled] = await repo.createServices([{ business_id: biz.id, name: "filtered showerhead", description: "From the site", price_cents: 6500, is_active: true }]);
    await repo.upsertConnection({ business_id: biz.id, provider: "shopify", status: "connected", account_id: "eskiin.myshopify.com", account_name: "eskiin", access_token: "shpat_x", refresh_token: null, token_expires_at: null, scopes: [] });
    const now = new Date("2026-09-19T12:00:00Z");
    const result = await syncShopify(repo, biz, { get, now });
    expect(result).toEqual({ products: 2, created: 1, updated: 1, orders: 1 });
    const services = await repo.listServices(biz.id);
    const head = services.find((s) => s.id === crawled.id)!;
    expect(head).toMatchObject({ name: "filtered showerhead", price_cents: 6800, cost_cents: 2250, external_id: "1", in_stock: true, description: "From the site" });
    expect(services.find((s) => s.name === "Replacement Filter")).toMatchObject({ price_cents: 2400, external_id: "2" });
    const read = await repo.getLatestStoreRead(biz.id);
    expect(read).toMatchObject({ captured_on: "2026-09-19", orders_30d: 1, new_customers_30d: 1, revenue_30d_cents: 6800, discount_codes: [{ code: "WELCOME15", summary: "15% off (Welcome)", ends_at: null }] });
    // A second sync updates by the store id, never duplicating.
    const again = await syncShopify(repo, biz, { get, now });
    expect(again).toEqual({ products: 2, created: 0, updated: 2, orders: 1 });
    expect(await repo.listServices(biz.id)).toHaveLength(2);
  });

  it("skips a brand with no store and reports a failing store without throwing", async () => {
    const repo = createDemoRepo({ kind: "user", userId: "owner" });
    const biz = await repo.createBusiness(bizInput("owner"));
    expect((await syncShopify(repo, biz, { get })).skipped).toBe("no Shopify connection");
    await repo.upsertConnection({ business_id: biz.id, provider: "shopify", status: "connected", account_id: "x.myshopify.com", account_name: "x", access_token: "t", refresh_token: null, token_expires_at: null, scopes: [] });
    const failing = await syncShopify(repo, biz, {
      get: async () => {
        throw new Error("shopify /products.json: 401");
      },
    });
    expect(failing.skipped).toMatch(/401/);
  });
});
