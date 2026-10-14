import "server-only";

import { get } from "@/lib/site";

import { findSignupForm, klaviyoCompany } from "./parse";

/**
 * Sign a rival's inbox up to its public newsletter, the way a visitor would:
 * the site's own signup form (Shopify, Mailchimp, plain HTML), or the Klaviyo
 * form most DTC brands use. One attempt per rival; when neither works (a
 * captcha, a popup we can't fill), the owner signs the address up by hand.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export interface SubscribeResult {
  ok: boolean;
  via: "form" | "klaviyo" | null;
  note: string;
}

async function viaKlaviyo(company: string, email: string): Promise<boolean> {
  // The list a site's signup forms add to, from Klaviyo's public form config.
  const config = await get(`https://fast.a.klaviyo.com/forms/api/v7/full-forms?company_id=${company}`, { accept: "application/json" });
  const listId = config?.match(/"listId"\s*:\s*"([A-Za-z0-9]{6})"/)?.[1] ?? config?.match(/"list_id"\s*:\s*"([A-Za-z0-9]{6})"/)?.[1];
  if (!listId) return false;
  const res = await fetch(`https://a.klaviyo.com/client/subscriptions/?company_id=${company}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", revision: "2024-10-15", "user-agent": UA },
    body: JSON.stringify({
      data: {
        type: "subscription",
        attributes: {
          custom_source: "Newsletter signup",
          profile: { data: { type: "profile", attributes: { email, subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } } } } },
        },
        relationships: { list: { data: { type: "list", id: listId } } },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return Boolean(res && res.status >= 200 && res.status < 300);
}

export async function autoSubscribe(website: string, email: string): Promise<SubscribeResult> {
  let base: string;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    base = `${u.protocol}//${u.hostname}`;
  } catch {
    return { ok: false, via: null, note: "No website to sign up on." };
  }
  const html = await get(base);
  if (!html) return { ok: false, via: null, note: "Their site didn't load for us." };

  const company = klaviyoCompany(html);
  if (company && (await viaKlaviyo(company, email))) return { ok: true, via: "klaviyo", note: "Signed up through their Klaviyo form." };

  const form = findSignupForm(html, base, email);
  if (form) {
    const body = new URLSearchParams(form.fields);
    const url = form.method === "GET" ? `${form.action}${form.action.includes("?") ? "&" : "?"}${body}` : form.action;
    const res = await fetch(url, {
      method: form.method,
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded", referer: base, origin: base, accept: "text/html,*/*" },
      body: form.method === "POST" ? body : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res && res.ok && !/challenge|captcha/i.test(res.url)) {
      const text = await res.text().catch(() => "");
      if (!/captcha|are you a robot|verify you are human/i.test(text.slice(0, 50_000))) return { ok: true, via: "form", note: "Signed up through the form on their site." };
    }
    return { ok: false, via: null, note: "Their signup form asked for a check we can't pass. Sign the address up by hand." };
  }
  return { ok: false, via: null, note: company ? "Their Klaviyo signup didn't take. Sign the address up by hand." : "No signup form we could fill on their homepage. Sign the address up by hand." };
}
