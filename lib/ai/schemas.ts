import { z } from "zod";

/**
 * Zod schemas for every generation call. Both the Gemini path and the
 * deterministic fallback validate against these, so downstream screens can
 * trust the shape either way.
 */

export const AudienceSchema = z.object({
  who: z.string().min(3),
  age_range: z.string().min(2),
  radius_miles: z.number().int().min(1).max(200),
  interests: z.array(z.string()).min(1).max(10),
  why: z.string().min(3),
  /** For the learnings loop — which persuasion shape this angle uses. */
  angle_type: z.enum(["education", "offer", "scarcity", "social_proof", "speed", "novelty"]),
});

export const AngleSchema = z.object({
  angle: z.string().min(8),
  hook: z.string().min(8),
  offer: z.string().min(4),
  audience: AudienceSchema,
});
export type AngleResult = z.infer<typeof AngleSchema>;

export const CampaignAssetsSchema = z.object({
  headlines: z.array(z.string().min(4)).length(5),
  primary_texts: z.array(z.string().min(20)).length(3),
  scripts: z.array(z.string().min(40)).length(3),
  static_briefs: z.array(z.string().min(20)).length(3),
  landing_copy: z.string().min(60),
});
export type CampaignAssets = z.infer<typeof CampaignAssetsSchema>;

export const GenerationSchema = z.object({
  angle: AngleSchema,
  assets: CampaignAssetsSchema,
});
export type GenerationResult = z.infer<typeof GenerationSchema>;

export const BusinessBriefSchema = z.object({
  positioning: z.string().min(40),
  customer_segments: z.array(z.string().min(10)).min(2).max(4),
  market_context: z.string().min(40),
  pricing_read: z.string().min(40),
  seasonality: z.string().min(40),
  does_well: z.array(z.string().min(10)).min(2).max(4),
  moat: z.string().min(20),
  advantages: z.array(z.string().min(10)).min(2).max(4),
  watchouts: z.array(z.string().min(10)).min(2).max(4),
  first_moves: z.array(z.string().min(10)).min(2).max(4),
});
export type BusinessBriefResult = z.infer<typeof BusinessBriefSchema>;

export const SiteExtractSchema = z.object({
  name: z.string().min(1).nullable(),
  category: z.string().min(3).nullable(),
  city: z.string().min(2).nullable(),
  region: z.string().nullable(),
  services: z.array(z.object({ name: z.string().min(2), price: z.string() })).max(15),
  voice_hint: z.string().nullable(),
  price_band: z.string().nullable(),
});
export type SiteExtract = z.infer<typeof SiteExtractSchema>;
