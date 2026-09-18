import { describe, expect, it } from "vitest";

import type { CompetitorRead } from "../lib/db/types";
import { adsFromRead, isTemplateText, sharedPhrases, themesAcrossRivals, type DossierRival } from "../lib/research/dossier";

const read = (ads: unknown[]): CompetitorRead => ({
  id: "r",
  competitor_id: "c",
  business_id: "b",
  kind: "ads",
  value: ads.length,
  rating: null,
  summary: "",
  raw: { ads },
  captured_at: "2026-09-15T04:00:00Z",
});

describe("the research dossier's competitive read", () => {
  it("drops Meta catalog templates as copy but keeps the ad, longest running first", () => {
    const ads = adsFromRead(
      read([
        { advertiser: "ActandAcre", headline: "{{product.name}}", snippet: "{{product.brand}}", cta: "Shop now", runningDays: 32, startedOn: "2026-08-14" },
        { advertiser: "ActandAcre", headline: "Scalp first", snippet: "Healthy hair starts at the scalp. Try the scalp serum.", cta: "Learn more", runningDays: 70, landing: "https://x.com/serum", variants: 3 },
        { advertiser: "Roz Strategies", headline: "Free Guide", snippet: "Remove IRS penalties for clients", cta: "Learn more", runningDays: 546 },
      ]),
      "Act+Acre",
    );
    expect(ads).toHaveLength(2);
    expect(ads[0]).toMatchObject({ rival: "Act+Acre", headline: "Scalp first", runningDays: 70, landing: "https://x.com/serum", variants: 3 });
    expect(typeof ads[0].theme).toBe("string");
    expect(ads[1]).toMatchObject({ headline: null, text: "", theme: null, runningDays: 32 });
    expect(isTemplateText("{{ product.name }}")).toBe(true);
    expect(isTemplateText("The Towel")).toBe(false);
  });

  it("finds the phrases two rivals share and counts themes across rivals", () => {
    const rivals: DossierRival[] = ["Dae", "Ceremonia", "Roz"].map((name, i) => ({
      name,
      website: null,
      directness: 0.7,
      directnessReason: null,
      ads: {
        readOn: "2026-09-15",
        active: 2,
        longestRunningDays: 30,
        newThisWeek: 0,
        themes: [],
        list: [
          { rival: name, advertiser: name, headline: null, text: i < 2 ? "Healthy hair starts at the scalp, every wash day." : "Buy one get one free this weekend only.", cta: null, landing: null, startedOn: null, runningDays: 30, variants: null, theme: i < 2 ? "education" : "offer", url: null },
        ],
      },
      social: {},
      moves: [],
    }));
    const shared = sharedPhrases(rivals.flatMap((r) => r.ads?.list ?? []));
    expect(shared.some((p) => p.phrase === "starts at the scalp" && p.rivals.join(",") === "Ceremonia,Dae")).toBe(true);
    expect(shared.every((p) => p.rivals.length >= 2)).toBe(true);
    expect(themesAcrossRivals(rivals)).toEqual([
      { theme: "education", ads: 2, rivals: 2 },
      { theme: "offer", ads: 1, rivals: 1 },
    ]);
  });
});
