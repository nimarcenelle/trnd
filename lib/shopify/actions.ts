"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

import { fetchShop, normalizeShop, shopifyFetcher } from "./client";
import { syncShopify } from "./sync";

export interface ShopifyState {
  error?: string;
  ok?: string;
}

/**
 * Connect a store with a custom app's Admin API token. The token is proven
 * against shop.json before it is kept, and the first sync runs on the
 * spot so the catalog shows its costs and variants right away. Only the
 * owner connects or disconnects; the token never leaves the server.
 */
export async function connectShopifyAction(_prev: ShopifyState, formData: FormData): Promise<ShopifyState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) return { error: "Only the brand's owner can connect the store." };
  const shop = normalizeShop(String(formData.get("shop") ?? ""));
  const token = String(formData.get("token") ?? "").trim();
  if (!shop) return { error: "Enter the store's myshopify.com domain (brand.myshopify.com)." };
  if (!/^shpat_[A-Za-z0-9]{16,}$/.test(token) && !/^shp[a-z]{2}_[A-Za-z0-9]{16,}$/.test(token)) {
    return { error: "That does not look like an Admin API access token (it starts with shpat_)." };
  }
  let name: string;
  try {
    name = (await fetchShop(shopifyFetcher(shop, token))).name;
  } catch (err) {
    console.warn("[shopify] connect failed:", (err as Error).message);
    return { error: "Shopify did not accept that token for that store. Check the store domain and that the app is installed." };
  }
  await repo.upsertConnection({
    business_id: business.id,
    provider: "shopify",
    status: "connected",
    account_id: shop,
    account_name: name,
    access_token: token,
    refresh_token: null,
    token_expires_at: null,
    scopes: ["read_products", "read_inventory", "read_orders", "read_discounts"],
  });
  const result = await syncShopify(repo, business);
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  if (result.skipped) return { ok: `Connected ${name}. The first sync hit a snag (${result.skipped}); it runs again tonight.` };
  return { ok: `Connected ${name}: ${result.products} products read, ${result.orders === null ? "orders not read yet" : `${result.orders} orders in the last 30 days`}.` };
}

export async function disconnectShopifyAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) return;
  await repo.deleteConnection(business.id, "shopify");
  revalidatePath("/app/settings");
}
