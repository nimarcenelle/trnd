import { describe, expect, it } from "vitest";

import {
  describeSignal,
  detectAdPixels,
  detectPlatform,
  extractEmails,
  findContactLinks,
  pickBestEmail,
} from "../lib/prospect/crawl";
import { boundingBox, distanceMiles } from "../lib/prospect/discover";
import { isChainName, rootDomain, scoreFit } from "../lib/prospect/fit";
import { chainDomains } from "../lib/prospect/pipeline";
import { bodyToHtml, DEFAULT_BODY, DEFAULT_SUBJECT, renderTemplate } from "../lib/prospect/template";
import type { ProspectLead } from "../lib/prospect/types";

const lead = (over: Partial<ProspectLead> = {}): ProspectLead => ({
  placeId: "p1",
  name: "Frontier Café",
  category: "Coffee shop",
  address: "123 Main St, Yucca Valley, CA 92284",
  city: "Yucca Valley",
  region: "CA",
  phone: null,
  website: "https://frontiercafe29.com",
  platform: "Wix",
  emails: ["frontiercafe@gmail.com"],
  bestEmail: "frontiercafe@gmail.com",
  emailStatus: "verified",
  signal: "No ad pixel detected",
  adPixels: [],
  rating: 4.5,
  reviewCount: 80,
  distanceMiles: 3.2,
  status: "queued",
  searchQuery: "",
  sentAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

describe("extractEmails", () => {
  it("finds mailto links and text emails, lowercased and deduped", () => {
    const html = `
      <a href="mailto:Hello@JoshuaTreeCoffee.com?subject=hi">Email us</a>
      <p>Reach us at hello@joshuatreecoffee.com or orders@joshuatreecoffee.com</p>`;
    expect(extractEmails(html)).toEqual(["hello@joshuatreecoffee.com", "orders@joshuatreecoffee.com"]);
  });

  it("survives the doubled-mailto typo seen in the wild", () => {
    const html = `<a href="mailto:mailto:wholesale@jtcoffee.com">wholesale</a>`;
    expect(extractEmails(html)).toEqual(["wholesale@jtcoffee.com"]);
  });

  it("drops junk locals, platform-noise domains, and asset filenames", () => {
    const html = `
      <p>noreply@frontiercafe29.com privacy@frontiercafe29.com</p>
      <p>abc123@sentry.wixpress.com lezzatos@restaurant.com</p>
      <img src="team@2x.png" alt="user@example.com" />
      <p>real@frontiercafe29.com</p>`;
    expect(extractEmails(html)).toEqual(["real@frontiercafe29.com"]);
  });
});

describe("pickBestEmail", () => {
  it("prefers a generic same-domain inbox over a personal off-domain one", () => {
    const emails = ["someone@gmail.com", "bob@frontiercafe29.com", "hello@frontiercafe29.com"];
    expect(pickBestEmail(emails, "www.frontiercafe29.com")).toBe("hello@frontiercafe29.com");
  });

  it("falls back to page order when nothing is on-domain", () => {
    expect(pickBestEmail(["first@gmail.com", "second@yahoo.com"], "site.com")).toBe("first@gmail.com");
    expect(pickBestEmail([], "site.com")).toBeNull();
  });
});

describe("platform + pixel detection", () => {
  it("fingerprints common site builders", () => {
    expect(detectPlatform('<script src="https://cdn.shopify.com/x.js">')).toBe("Shopify");
    expect(detectPlatform('<img src="https://static.wixstatic.com/a.png">')).toBe("Wix");
    expect(detectPlatform('<link href="https://static1.squarespace.com/a.css">')).toBe("Squarespace");
    expect(detectPlatform('<link href="/wp-content/themes/x/style.css">')).toBe("WordPress");
    expect(detectPlatform("<html><body>hi</body></html>")).toBe("Custom");
  });

  it("detects hard pixel evidence, not just GTM", () => {
    const meta = `<script>fbq('init','123');</script><script src="https://connect.facebook.net/en_US/fbevents.js"></script>`;
    expect(detectAdPixels(meta)).toEqual(["meta"]);
    expect(detectAdPixels(`gtag('config', 'AW-1234567890');`)).toEqual(["google"]);
    expect(detectAdPixels(`<script src="https://www.googletagmanager.com/gtm.js?id=GTM-XXX">`)).toEqual([]);
  });

  it("describes the signal for the table", () => {
    expect(describeSignal(null, false)).toBe("No website — listings only");
    expect(describeSignal(null, true)).toBe("Site unreadable");
    expect(describeSignal({ emails: [], platform: "Wix", adPixels: [] }, true)).toBe("No ad pixel detected");
    expect(describeSignal({ emails: [], platform: "Wix", adPixels: ["meta", "google"] }, true)).toBe("Meta + Google pixel live");
  });
});

describe("findContactLinks", () => {
  it("returns same-site contact-ish pages only", () => {
    const html = `
      <a href="/contact">Contact</a>
      <a href="https://frontiercafe29.com/about-us">About</a>
      <a href="https://instagram.com/contactfrontier">IG</a>
      <a href="/menu">Menu</a>`;
    expect(findContactLinks(html, "https://www.frontiercafe29.com/")).toEqual([
      "https://www.frontiercafe29.com/contact",
      "https://frontiercafe29.com/about-us",
    ]);
  });
});

describe("outreach template", () => {
  it("merges lead fields and includes the no-ads line only when earned", () => {
    const noAds = renderTemplate(DEFAULT_BODY, lead());
    expect(noAds).toContain("Frontier Café");
    expect(noAds).toContain("Yucca Valley");
    expect(noAds).toContain("not running any paid ads");
    expect(noAds).toContain('reply "no thanks"');
    expect(noAds).toContain("coffee shop");

    const running = renderTemplate(DEFAULT_BODY, lead({ adPixels: ["meta"] }));
    expect(running).not.toContain("not running any paid ads");
    expect(renderTemplate(DEFAULT_SUBJECT, lead())).toBe("idea for Frontier Café");
  });

  it("escapes HTML in the body render", () => {
    const html = bodyToHtml('Hi <b>there</b> & "friends"\n\nSecond paragraph');
    expect(html).toContain("&lt;b&gt;there&lt;/b&gt; &amp;");
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});

describe("fit score", () => {
  it("rates an owner-run, established, reachable local business hot", () => {
    const fit = scoreFit(lead());
    expect(fit.tier).toBe("hot");
    expect(fit.reasons[0]).toMatch(/accepts mail/);
    expect(fit.reasons).toContain("80 reviews — established, still owner-run");
    expect(fit.reasons).toContain("Gmail-style inbox — the owner reads it");
  });

  it("is zero with no reachable email, whatever else is true", () => {
    expect(scoreFit(lead({ bestEmail: null, emailStatus: "none" }))).toEqual({
      score: 0,
      tier: "cold",
      reasons: ["No reachable email"],
    });
    expect(scoreFit(lead({ website: null, bestEmail: null, emailStatus: "none" })).reasons).toEqual([
      "No website — listings only",
    ]);
  });

  it("penalizes chains, brand-new shops, and struggling ratings", () => {
    const chain = scoreFit(lead({ name: "Starbucks" }));
    expect(chain.tier).toBe("cold");
    expect(chain.reasons[0]).toMatch(/Chain brand/);
    const fresh = scoreFit(lead({ reviewCount: 2, rating: 5 }));
    expect(fresh.score).toBeLessThan(scoreFit(lead()).score);
    const bad = scoreFit(lead({ rating: 2.9 }));
    expect(bad.reasons).toContain("2.9★ — struggling; may not spend");
  });

  it("credits both ad segments, differently", () => {
    expect(scoreFit(lead({ adPixels: ["meta"] })).reasons).toContain("Runs ads already — proven willingness to pay");
    expect(scoreFit(lead()).reasons).toContain("No ad pixel — greenfield, needs to be sold on ads");
  });

  it("prefers a named own-domain inbox over a generic one over off-domain", () => {
    const named = scoreFit(lead({ bestEmail: "maria@frontiercafe29.com" })).score;
    const generic = scoreFit(lead({ bestEmail: "info@frontiercafe29.com" })).score;
    const off = scoreFit(lead({ bestEmail: "info@someagency.com" })).score;
    expect(named).toBeGreaterThan(generic);
    expect(generic).toBeGreaterThan(off);
  });
});

describe("chain detection", () => {
  it("matches known brands on word boundaries only", () => {
    expect(isChainName("Starbucks Reserve")).toBe(true);
    expect(isChainName("Planet Fitness - Yucca Valley")).toBe(true);
    expect(isChainName("Subwayside Café")).toBe(false);
    expect(isChainName("Frontier Café")).toBe(false);
  });

  it("flags a domain shared by three or more places, ignoring shared hosts", () => {
    const places = [
      { website: "https://www.crossfit-hd.com/" },
      { website: "https://crossfit-hd.com/yucca" },
      { website: "https://shop.crossfit-hd.com" },
      { website: "https://a.business.site" },
      { website: "https://b.business.site" },
      { website: "https://c.business.site" },
      { website: "https://solo.com" },
    ];
    expect([...chainDomains(places)]).toEqual(["crossfit-hd.com"]);
    expect(rootDomain("https://www.frontiercafe29.com/contact")).toBe("frontiercafe29.com");
    expect(rootDomain(null)).toBeNull();
  });
});

describe("geo", () => {
  it("measures distance and boxes a radius", () => {
    const tnp = { latitude: 34.1356, longitude: -116.0542 }; // Twentynine Palms
    const jt = { latitude: 34.1347, longitude: -116.3131 }; // Joshua Tree
    expect(distanceMiles(tnp, jt)).toBeCloseTo(14.8, 0);
    const box = boundingBox(tnp, 25);
    expect(box.high.latitude - box.low.latitude).toBeCloseTo(50 / 69, 3);
    expect(box.high.longitude).toBeGreaterThan(tnp.longitude);
    expect(distanceMiles(tnp, { latitude: tnp.latitude, longitude: box.high.longitude })).toBeCloseTo(25, 0);
  });
});
