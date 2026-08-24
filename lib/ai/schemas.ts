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
