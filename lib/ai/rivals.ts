import { z } from "zod";

import type { Business, BusinessBrief, Service } from "@/lib/db/types";
import { isModelConfigured } from "@/lib/env";

import { resolveModels, structuredCall } from "./openai";

/**
 * The brands an online owner would name as rivals. There is no map to
 * search: a DTC brand's rival is whoever sells the same kind of product to
 * the same customer at the same price, and that knowledge lives in a model
 * that has read the category, not in Places. The model only proposes.
 * lib/intel/discover-brands.ts reads every proposed site before a brand is
 * watched, because an invented brand or a guessed domain is the failure an
 * owner would spot first.
 */

export interface ProposedBrand {
  name: string;
  /** The store domain the model says the brand uses. Unverified. */
  website: string;
  instagram: string | null;
  tiktok: string | null;
  /** One sentence on the overlap, for logs and debugging the list. */
  why: string;
}

export const MAX_PROPOSED_BRANDS = 12;
const MAX_SITE_TEXT = 3000;

const BrandsSchema = z.object({
  brands: z.array(
    z.object({
      name: z.string(),
      website: z.string(),
      instagram: z.string().nullish(),
      tiktok: z.string().nullish(),
      why: z.string().nullish(),
    }),
  ),
});

type BriefInput = Partial<
  Pick<BusinessBrief, "positioning" | "customer_segments" | "pricing_read" | "lexicon">
> | null;

const blankToNull = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t && !/^(null|none|n\/a|unknown)$/i.test(t) ? t : null;
};

const priceOf = (cents: number | null) => (cents === null ? "" : ` ($${(cents / 100).toFixed(cents % 100 ? 2 : 0)})`);

export function buildRivalBrandsPrompt(
  business: Pick<Business, "name" | "website" | "category" | "price_band" | "monthly_ad_spend">,
  services: Pick<Service, "name" | "price_cents" | "is_active">[],
  brief: BriefInput,
  siteText?: string | null,
): string {
  const range = services
    .filter((s) => s.is_active)
    .slice(0, 40)
    .map((s) => `${s.name}${priceOf(s.price_cents)}`)
    .join("; ");
  const text = (siteText ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SITE_TEXT);
  return [
    `You name the direct competitors of one online, direct-to-consumer brand: the other brands its customer is choosing between when an ad for this one shows up in their feed.`,
    `BRAND: ${business.name}${business.website ? ` (${business.website})` : ""}, ${business.category}.`,
    `SELLS: ${range || "not specified"}.`,
    business.price_band ? `PRICE BAND: ${business.price_band}` : "",
    business.monthly_ad_spend ? `PAID SOCIAL SPEND: ${business.monthly_ad_spend} a month` : "",
    brief?.positioning ? `POSITIONING: ${brief.positioning}` : "",
    (brief?.customer_segments ?? []).length > 0 ? `CUSTOMERS: ${brief?.customer_segments?.join(" | ")}` : "",
    brief?.pricing_read ? `PRICING: ${brief.pricing_read}` : "",
    (brief?.lexicon ?? []).length > 0 ? `PRODUCT WORDS: ${brief?.lexicon?.join(", ")}` : "",
    text ? `FROM THEIR SITE: ${text}` : "",
    ``,
    `Return up to ${MAX_PROPOSED_BRANDS} competing brands, most direct first. Every brand must:`,
    `- Sell substantially the same kind of product to the same customer at a similar price. A $38 barrier serum competes with other $30 to $50 barrier serums, not a $9 drugstore moisturizer or a $200 prestige cream.`,
    `- Be a brand with its own online store. Prefer brands of a similar size to this one that advertise on Meta and TikTok, because their ads are the ones this brand's ads are up against.`,
    `- Never be a marketplace or retailer (Amazon, Target, Walmart, Sephora, Ulta, Nordstrom, Etsy). Never a mega-brand this brand can't be compared against (the Nike or L'Oreal of the category) unless nothing else fits.`,
    `- Be a brand you are confident exists, with the domain it actually uses for its store. If you are not sure of the domain, leave the brand out. An invented brand or a guessed domain is worse than a shorter list.`,
    `Never include ${business.name} itself.`,
    ``,
    `For each brand return: name (as the brand writes it), website (its real store domain, like "brand.com"), instagram and tiktok (the handle without @, or null unless you are certain), why (one plain sentence on what they sell that overlaps and at what price, with no dashes).`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Up to 12 proposed rival brands. Resolves [] when the model isn't configured
 * or both models fail: discovery with nothing to verify seeds nothing,
 * which beats a list the owner has to clean up.
 */
export async function proposeCompetingBrands(
  business: Business,
  services: Service[],
  brief: BriefInput,
  siteText?: string | null,
): Promise<ProposedBrand[]> {
  if (!isModelConfigured) return [];
  try {
    const models = await resolveModels();
    const prompt = buildRivalBrandsPrompt(business, services, brief, siteText);
    const validate = (d: unknown) => BrandsSchema.parse(d);
    // Pro first: naming real brands with their real domains is recall, and
    // the larger model invents fewer. Flash is the fallback, not the default.
    let parsed: z.infer<typeof BrandsSchema>;
    try {
      parsed = await structuredCall(models.pro, prompt, BrandsSchema, validate, {
        // Naming real brands and the domains they use is recall, not invention.
        temperature: 0.2,
      });
    } catch (err) {
      console.warn(`[ai] rival brands on ${models.pro} failed, retrying on ${models.flash}:`, (err as Error).message);
      parsed = await structuredCall(models.flash, prompt, BrandsSchema, validate, { temperature: 0.2 });
    }
    const out: ProposedBrand[] = [];
    for (const b of parsed.brands) {
      const name = blankToNull(b.name);
      const website = blankToNull(b.website);
      if (!name || !website) continue;
      out.push({
        name,
        website,
        instagram: blankToNull(b.instagram),
        tiktok: blankToNull(b.tiktok),
        why: blankToNull(b.why) ?? "",
      });
      if (out.length >= MAX_PROPOSED_BRANDS) break;
    }
    return out;
  } catch (err) {
    console.warn("[ai] rival brand proposal failed (non-fatal):", (err as Error).message);
    return [];
  }
}
