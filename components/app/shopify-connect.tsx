"use client";

import { useActionState } from "react";

import { connectShopifyAction, type ShopifyState } from "@/lib/shopify/actions";

/** The store connect box on Settings: domain and a custom app's token. */
export default function ShopifyConnect() {
  const [state, formAction, pending] = useActionState<ShopifyState, FormData>(connectShopifyAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-2 mt-2">
      <input name="shop" placeholder="brand.myshopify.com" aria-label="Store domain" className="input py-[6px] text-[12.5px]" required />
      <input name="token" type="password" placeholder="shpat_… (Admin API access token)" aria-label="Admin API access token" className="input py-[6px] text-[12.5px]" required autoComplete="off" />
      <button type="submit" className="btn btn-primary btn-sm self-start" disabled={pending}>
        {pending ? "Connecting…" : "Connect Shopify"}
      </button>
      {state.error && (
        <p className="m-0 font-mono text-[11.5px] text-red" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="m-0 font-mono text-[11.5px] text-(--mint-text)">{state.ok}</p>}
    </form>
  );
}
