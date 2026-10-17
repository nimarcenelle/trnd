import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { confirmLink, emailLinks, emailText, findSignupForm, inboxAddress, klaviyoCompany, readWebhook, tokenFromRecipients } from "@/lib/inbox/parse";
import { verifyInbound } from "@/lib/inbox/verify";
import { diffSnapshots, promoKey, promoLines, shopifyProducts, snapshotFrom, type SiteSnapshot, recentProducts } from "@/lib/sitewatch/snapshot";
import { buildTimeline, byDay } from "@/lib/timeline";

const snap = (over: Partial<SiteSnapshot>): SiteSnapshot => ({
  title: "Tidewell",
  description: "Shower filters",
  headlines: ["Clean water, every shower"],
  promos: [],
  nav: [],
  products: [],
  catalog: true,
  text_hash: "a",
  ...over,
});
const product = (id: string, price: number, compare_at: number | null = null) => ({ id, title: id, price, compare_at, available: true, url: null });

describe("website snapshots", () => {
  it("reads a Shopify catalog: lowest variant price and real sales only", () => {
    const products = shopifyProducts(
      {
        products: [
          { handle: "filter", title: "Filter", variants: [{ price: "79.00", compare_at_price: "99.00", available: true }, { price: "129.00" }] },
          { handle: "refill", title: "Refill", variants: [{ price: "25.00", compare_at_price: "25.00", available: false }] },
        ],
      },
      "https://tidewell.com",
    );
    expect(products).toEqual([
      { id: "filter", title: "Filter", price: 79, compare_at: 99, available: true, url: "https://tidewell.com/products/filter", created_at: null },
      { id: "refill", title: "Refill", price: 25, compare_at: null, available: false, url: "https://tidewell.com/products/refill", created_at: null },
    ]);
  });

  it("takes headlines, the announcement bar and offer lines off the homepage", () => {
    const s = snapshotFrom({
      html: `<title>Tidewell | Filters</title><meta name="description" content="Filtered showers for less">
        <div class="announcement-bar">Free shipping over $50</div><nav><a href="/shop">Shop</a><a href="/about">About</a></nav>
        <h1>Clean water, half the price</h1><h2>Why Tidewell</h2><p>Bundle and save 20% off today only. We love water.</p>`,
      markdown: null,
      base: "https://tidewell.com",
      catalog: null,
    });
    expect(s.title).toBe("Tidewell | Filters");
    expect(s.headlines).toEqual(["Clean water, half the price", "Why Tidewell"]);
    expect(s.nav).toEqual(["Shop", "About"]);
    expect(s.promos).toContain("Free shipping over $50");
    expect(s.promos.some((p) => p.includes("20% off"))).toBe(true);
    expect(s.catalog).toBe(false);
  });

  it("finds offer lines and skips plain copy", () => {
    expect(promoLines("Get 15% off your first order. Our story starts in Maine.")).toEqual(["Get 15% off your first order."]);
  });

  it("records material changes: products, prices, sales, promos, messaging", () => {
    const prev = snap({ products: [product("filter", 79), product("refill", 25), product("old", 10)], promos: ["Free shipping over $50"] });
    const next = snap({
      headlines: ["Clean water, half the price"],
      products: [product("filter", 59, 79), product("refill", 29), product("travel", 39)],
      promos: ["3 filters for $79 bundle"],
    });
    const kinds = diffSnapshots(prev, next).map((d) => `${d.kind}: ${d.title}`);
    expect(kinds).toEqual([
      "new_product: New product: travel",
      "dropped_product: Dropped: old",
      "sale_started: On sale: filter",
      "price_up: Price up: refill",
      "promo_added: New promotion",
      "promo_removed: Promotion removed",
      "message_changed: New homepage headline",
    ]);
  });

  it("doesn't call products dropped without a full catalog, and collapses a big day into one line", () => {
    const many = Array.from({ length: 8 }, (_, i) => product(`p${i}`, 10));
    expect(diffSnapshots(snap({ catalog: false, products: [product("a", 1)] }), snap({ catalog: false, products: [] }))).toEqual([]);
    const d = diffSnapshots(snap({ products: [] }), snap({ products: many }));
    expect(d).toHaveLength(1);
    expect(d[0].title).toBe("8 products added");
  });
});

describe("competitor inbox", () => {
  it("addresses each rival and finds it again from the recipient", () => {
    const addr = inboxAddress("Clear Well & Co.", "k3x9q2ab", "in.usetrnd.com");
    expect(addr).toBe("clear-well-co-k3x9q2ab@in.usetrnd.com");
    expect(tokenFromRecipients([`"TRND" <${addr}>`], "in.usetrnd.com")).toBe("k3x9q2ab");
    expect(tokenFromRecipients(["someone@else.com"], "in.usetrnd.com")).toBeNull();
  });

  it("reads Resend's webhook and a plain JSON post", () => {
    const resend = readWebhook({ type: "email.received", data: { email_id: "re_1", from: "Clearwell <hi@clearwell.co>", to: ["x-abc123@in.t.com"], subject: "25% off" } });
    expect(resend?.resendId).toBe("re_1");
    expect(resend?.email).toMatchObject({ from: "hi@clearwell.co", fromName: "Clearwell", subject: "25% off", to: ["x-abc123@in.t.com"] });
    const plain = readWebhook({ from: "hi@fenn.com", to: "x-abc123@in.t.com", subject: "New", html: "<p>Hi</p>" });
    expect(plain?.resendId).toBeNull();
    expect(plain?.email.html).toBe("<p>Hi</p>");
    expect(readWebhook({ hello: "world" })).toBeNull();
  });

  it("turns email HTML into text and keeps the links a reader would click", () => {
    const html = `<head><style>p{}</style></head><h1>Summer sale</h1><p>25% off&nbsp;everything</p>
      <a href="https://clearwell.co/sale">Shop the sale</a><a href="https://clearwell.co/unsubscribe">Unsubscribe</a>
      <a href="https://instagram.com/clearwell">IG</a><a href="https://netflix.com/x">Partner</a>`;
    expect(emailText(html)).toBe("Summer sale\n25% off everything\nShop the sale Unsubscribe\nIG Partner");
    expect(emailLinks(html).map((l) => l.url)).toEqual(["https://clearwell.co/sale", "https://netflix.com/x"]);
  });

  it("finds the double opt-in link", () => {
    const links = [
      { text: "Shop now", url: "https://fenn.com" },
      { text: "Confirm my subscription", url: "https://fenn.us1.list-manage.com/subscribe/confirm?u=1" },
    ];
    expect(confirmLink({ subject: "Please confirm your subscription", text: "", links })).toBe("https://fenn.us1.list-manage.com/subscribe/confirm?u=1");
    expect(confirmLink({ subject: "25% off this weekend", text: "Shop now", links })).toBeNull();
  });

  it("fills in a Shopify newsletter form and leaves login and search forms alone", () => {
    const html = `<form action="/search"><input type="search" name="q"></form>
      <form action="/account/login" method="post"><input type="email" name="customer[email]"><input type="password" name="customer[password]"></form>
      <form method="post" action="/contact#footer"><input type="hidden" name="form_type" value="customer"><input type="hidden" name="contact[tags]" value="newsletter">
      <input type="email" name="contact[email]" placeholder="Email"><button>Subscribe</button></form>`;
    expect(findSignupForm(html, "https://tidewell.com", "x@in.t.com")).toEqual({
      action: "https://tidewell.com/contact#footer",
      method: "POST",
      fields: { form_type: "customer", "contact[tags]": "newsletter", "contact[email]": "x@in.t.com" },
    });
    expect(findSignupForm(`<form action="/search"><input name="q"></form>`, "https://t.com", "x@y.z")).toBeNull();
  });

  it("spots the site's Klaviyo account", () => {
    expect(klaviyoCompany('<script src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AbC123"></script>')).toBe("AbC123");
  });

  it("accepts only signed webhooks", () => {
    const key = Buffer.from("supersecretkey123").toString("base64");
    const secret = `whsec_${key}`;
    const body = '{"type":"email.received"}';
    const ts = "1760000000";
    const sig = createHmac("sha256", Buffer.from(key, "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
    const headers = new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,${sig}` });
    const url = "https://t.com/api/inbound";
    expect(verifyInbound({ secret, body, headers, url, now: 1760000000_000 })).toBe(true);
    expect(verifyInbound({ secret, body: body + " ", headers, url, now: 1760000000_000 })).toBe(false);
    expect(verifyInbound({ secret, body, headers, url, now: 1760009999_000 })).toBe(false);
    expect(verifyInbound({ secret: "plain", body, headers: new Headers(), url: `${url}?secret=plain` })).toBe(true);
    expect(verifyInbound({ secret: "plain", body, headers: new Headers(), url: `${url}?secret=nope` })).toBe(false);
  });
});

describe("timeline", () => {
  it("merges the three streams newest first and groups them by day", () => {
    const events = buildTimeline({
      adChanges: [
        {
          id: "c1",
          brand_id: "b",
          rival_id: "r1",
          ad_id: "a1",
          kind: "launched",
          detected_at: "2026-10-12T08:00:00Z",
          ad: { archive_id: "123", hook: "Your shampoo isn't the problem", title: null, body: null, angle: "problem/solution", offer: "none", image_url: null } as never,
        },
      ],
      site: [{ id: "s1", brand_id: "b", rival_id: "r1", kind: "price_down", title: "Price down: Filter", before: "$79", after: "$59", url: "https://t.com/p", detected_at: "2026-10-13T08:00:00Z" }],
      emails: [
        { id: "e1", brand_id: "b", rival_id: "r2", message_id: null, from_address: null, from_name: null, subject: "25% off", preview: null, body: null, links: [], received_at: "2026-10-12T20:00:00Z", kind: "promo", offer: "25% off", theme: "summer", is_repeat: true },
        { id: "e2", brand_id: "b", rival_id: "r2", message_id: null, from_address: null, from_name: null, subject: "Confirm", preview: null, body: null, links: [], received_at: "2026-10-14T20:00:00Z", kind: "confirmation", offer: null, theme: null, is_repeat: null },
      ],
      emailHref: (e) => `/e/${e.id}`,
    });
    expect(events.map((e) => `${e.channel}:${e.tag}`)).toEqual(["site:Price down", "email:Promo email", "ad:New ad"]);
    expect(events[0].detail).toBe("$79 → $59");
    expect(events[1].detail).toBe("25% off · summer · repeat");
    expect(byDay(events).map((d) => [d.day, d.events.length])).toEqual([
      ["2026-10-13", 1],
      ["2026-10-12", 2],
    ]);
  });
});

describe("a first snapshot names the products the store added lately", () => {
  const snap = (products: { id: string; title: string; created_at: string | null }[]) =>
    ({ title: null, description: null, headlines: [], promos: [], nav: [], products: products.map((p) => ({ ...p, price: 20, compare_at: null, available: true, url: null })), catalog: true, text_hash: "h" }) as never;
  it("dates each new product when it was published and groups many into one line", () => {
    const one = recentProducts(snap([{ id: "a", title: "Mist", created_at: "2026-10-01T00:00:00Z" }, { id: "b", title: "Old", created_at: "2026-06-01T00:00:00Z" }]), "2026-10-15T17:00:00Z");
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ kind: "new_product", title: "New product: Mist", detected_at: "2026-10-01T00:00:00Z" });
    const many = recentProducts(snap(["a", "b", "c", "d"].map((id) => ({ id, title: id.toUpperCase(), created_at: "2026-10-05T00:00:00Z" }))), "2026-10-15T17:00:00Z");
    expect(many).toHaveLength(1);
    expect(many[0].title).toBe("4 products added");
    expect(recentProducts(snap([{ id: "x", title: "No date", created_at: null }]), "2026-10-15T17:00:00Z")).toEqual([]);
  });
});

describe("promotions on a rotating banner", () => {
  const snap = (promos: string[]) => ({ title: null, description: null, headlines: [], promos, nav: [], products: [], catalog: false, text_hash: "h" }) as unknown as SiteSnapshot;
  it("keys the fragments of one offer the same", () => {
    expect(promoKey("Free Shipping On Orders $25+ (Cont. U.S.)")).toBe(promoKey("Free Shipping On Orders $25+ (Cont."));
    expect(promoKey("Free Shipping On Orders $25+")).not.toBe(promoKey("Free Shipping On Orders $40+"));
  });
  it("does not report a fragment seen in a recent read as new, nor a flickering one as removed", () => {
    const a = snap(["ELEVATE YOUR HYDRATION TODAY! | Free Shipping On Orders $25+ (Cont. U.S.)"]);
    const b = snap(["Free Shipping On Orders $25+ (Cont."]);
    expect(diffSnapshots(a, b, [b, a])).toEqual([]);
    // A promotion stable across the last reads that vanishes is reported; a brand-new one is reported.
    const c = snap(["Buy one get one free"]);
    const kinds = diffSnapshots(a, c, [a, a]).map((d) => d.kind);
    expect(kinds).toEqual(["promo_added", "promo_removed"]);
  });
});
