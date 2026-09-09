import { describe, expect, it } from "vitest";

import {
  describeSignal,
  detectAdPixels,
  detectPlatform,
  extractEmails,
  findContactLinks,
  pickBestEmail,
} from "../lib/prospect/crawl";
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
