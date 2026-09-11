import { describe, expect, it } from "vitest";

import { previewTerms, termFromService } from "../lib/preview/terms";
import { guardPublicUrl, isPrivateAddress } from "../lib/preview/url-guard";
import { takeSlot } from "../lib/preview/rate-limit";
import type { SiteImport } from "../lib/import/website";

const site = (over: Partial<SiteImport> = {}): SiteImport => ({
  name: "Glow Studio",
  category: "Health & beauty",
  city: "Atlanta",
  region: "GA",
  services: [],
  ...over,
});

describe("public URL guard", () => {
  it("knows which addresses are private", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
    // Anything that isn't an address at all is refused, not assumed public.
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });

  it("refuses everything that isn't a public website, before any DNS call", async () => {
    const refusals = [
      "file:///etc/passwd",
      "ftp://example.com",
      "http://user:pass@example.com",
      "http://example.com:8080",
      "http://localhost",
      "http://printer.local",
      "http://169.254.169.254",
      "http://10.0.0.5",
      "not a url",
    ];
    for (const url of refusals) {
      const verdict = await guardPublicUrl(url);
      expect(verdict.ok, url).toBe(false);
    }
  });
});

describe("preview watch terms", () => {
  it("turns a menu line into a searchable phrase", () => {
    expect(termFromService("Brow Lamination")).toBe("brow lamination");
    expect(termFromService("Hydrafacial ($180)")).toBe("hydrafacial");
    expect(termFromService("Deluxe Signature Full Body Treatment Ritual")).toBeNull(); // too long
    expect(termFromService("Gift Card")).toBeNull(); // measures the category, not them
    expect(termFromService("$")).toBeNull();
  });

  it("leads with their own menu and fills in behind it from the category", () => {
    const terms = previewTerms(
      site({
        services: [
          { name: "Brow Lamination", price: "95" },
          { name: "Gift Card", price: "50" },
          { name: "Dermaplaning", price: "120" },
        ],
      }),
    );
    expect(terms.own).toEqual(["brow lamination", "dermaplaning"]);
    expect(terms.all.slice(0, 2)).toEqual(["brow lamination", "dermaplaning"]);
    // Category terms fill the rest so a thin site still gets a real read.
    expect(terms.all.length).toBeGreaterThan(2);
    expect(terms.category).toContain("lip filler");
    // A term already read off the menu is never watched twice.
    expect(new Set(terms.all).size).toBe(terms.all.length);
  });

  it("still produces terms for a site with no menu at all", () => {
    const terms = previewTerms(site({ services: [] }));
    expect(terms.own).toEqual([]);
    expect(terms.all.length).toBeGreaterThan(0);
  });

  it("falls back to nothing rather than guessing for an unknown category", () => {
    const terms = previewTerms(site({ category: "Something we don't cover", services: [] }));
    expect(terms.all).toEqual([]);
  });
});

describe("snapshot rate limit", () => {
  it("lets a caller through a few times, then holds them off", () => {
    const key = `test-${Math.random()}`;
    const verdicts = Array.from({ length: 10 }, () => takeSlot(key));
    expect(verdicts.filter((v) => v.ok).length).toBe(8);
    const last = verdicts.at(-1)!;
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.reason).toMatch(/try again/i);
  });
});
