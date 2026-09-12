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
  // Set over the photo in the ad preview and in the owner's own creative,
  // where a sentence is unreadable. The prompt asks for ten words; this is
  // the backstop that makes a paragraph fail and retry rather than ship.
  offer: z.string().min(4).max(90),
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
  // Meta clips a headline near 40 characters and hides primary text past
  // ~125 behind "See more". The prompt asks for those; these caps are the
  // backstop, set where copy stops being long and starts being truncated
  // mid-thought in the only place anyone reads it.
  headlines: z.array(z.string().min(4).max(60)).length(5),
  primary_texts: z.array(z.string().min(20).max(220)).length(3),
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

/** The ONE customer the ads are for — see TargetCustomer in lib/db/types. */
export const TargetCustomerSchema = z.object({
  who: z.string().min(20),
  triggers: z.array(z.string().min(4)).min(2).max(6),
  vocabulary: z.array(z.string().min(2)).min(6).max(24),
  hangouts: z.array(z.string().min(2)).max(8),
  objections: z.array(z.string().min(6)).min(1).max(4),
});
export type TargetCustomerResult = z.infer<typeof TargetCustomerSchema>;

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
  target_customer: TargetCustomerSchema,
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
  terms: z
    .array(
      z.object({
        term: z.string().min(2),
        /** Whether the hashtag is about what the queried industry SELLS, as
         * opposed to a national moment its advertisers posted into. */
        on_topic: z.boolean(),
      }),
    )
    .min(1),
});

/** The format read mined from a term's winning Shorts. Bounded to three
 * patterns: an owner shooting this week can act on three, not ten. */
export const ShortFormatSchema = z.object({
  formats: z
    .array(
      z.object({
        name: z.string().min(3),
        shape: z.string().min(10),
        evidence: z.string().min(3),
      }),
    )
    .min(1)
    .max(3),
  shoot: z.string().min(10),
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

/** Most items a document read keeps — a full diner menu runs past sixty. */
export const MAX_DOCUMENT_SERVICES = 80;

// Lists are trimmed, not rejected: a brunch menu with 45 items is a good
// read, and failing the whole digest over it left the owner with nothing
// (Carolina Coffee Shop's fall brunch PDF, every attempt).
export const DocumentDigestSchema = z.object({
  kind: z.enum(["menu", "sales", "reviews", "brand", "results", "other"]),
  summary: z.string().min(20),
  facts: z.array(z.string()).transform((a) => a.filter((s) => s.trim().length >= 8).slice(0, 12)),
  services_found: z
    .array(z.object({ name: z.string(), price_cents: z.number().int().nullable() }))
    .transform((a) => a.filter((s) => s.name.trim().length >= 2).slice(0, MAX_DOCUMENT_SERVICES)),
  watchouts: z.array(z.string()).transform((a) => a.filter((s) => s.trim().length >= 8).slice(0, 4)),
});
export type DocumentDigestResult = z.infer<typeof DocumentDigestSchema>;
