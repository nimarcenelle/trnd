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

/** Three candidate angles from one call — the tournament the judge picks from. */
export const AngleSlateSchema = z.object({
  angles: z.array(AngleSchema).length(3),
});

export const AngleVerdictSchema = z.object({
  winner: z.number().int().min(0).max(2),
  reason: z.string().min(8),
});

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
  watch_terms: z.array(z.string().min(3)).min(4).max(30),
  lexicon: z.array(z.string().min(2)).max(24),
  subreddits: z.array(z.string().min(2)).max(6),
});
export type BusinessBriefResult = z.infer<typeof BusinessBriefSchema>;

export const RelevanceSchema = z.object({
  judgments: z
    .array(
      z.object({
        index: z.number().int().min(0),
        relevance: z.number().min(0).max(1),
        reason: z.string().min(4),
      }),
    )
    .min(1),
});
export type RelevanceResult = z.infer<typeof RelevanceSchema>;

export const IntelNoteSchema = z.object({
  headline: z.string().min(12),
  narrative: z.array(z.string().min(40)).min(2).max(3),
  actions: z.array(z.string().min(10)).min(2).max(4),
});
export type IntelNoteResult = z.infer<typeof IntelNoteSchema>;

export const ReviewDigestSchema = z.object({
  themes: z.array(z.string().min(6)).min(1).max(4),
  copy_hooks: z.array(z.string().min(6)).min(1).max(4),
  watchouts: z.array(z.string().min(6)).max(3),
});
export type ReviewDigestResult = z.infer<typeof ReviewDigestSchema>;

export const AskAnswerSchema = z.object({
  answer: z.array(z.string().min(20)).min(1).max(4),
  citations: z.array(z.object({ claim: z.string().min(6), source: z.string().min(3) })).max(6),
  /** Assumed numbers used in the reasoning — each phrased so the owner can
   * correct it and re-ask. */
  assumptions: z.array(z.string().min(6)).max(5),
  /** True only when even a reasoned, assumption-labeled estimate would be
   * dishonest — not merely "the context lacks this number". */
  insufficient: z.boolean(),
  /** Pick-scoped asks only: when the owner's question implies a different
   * way to run the campaign (another service, offer, audience, or angle), a
   * one-sentence build directive in the imperative. Null when the question
   * was just a question. */
  direction: z.string().nullable().optional(),
  /** Standing questions only: one sentence on what moved since the previous
   * answer. Null when there was no previous answer. */
  changed: z.string().nullable().optional(),
});
export type AskAnswerResult = z.infer<typeof AskAnswerSchema>;

export const PickReadSchema = z.object({
  paragraphs: z.array(z.string().min(40)).min(2).max(3),
  questions: z.array(z.string().min(12)).min(2).max(3),
});
export type PickReadResult = z.infer<typeof PickReadSchema>;

export const HumanizeSchema = z.object({
  terms: z.array(z.string().min(2)).min(1),
});

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
