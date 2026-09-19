import type { Business, NewReviewDigest, Review } from "@/lib/db/types";
import { isModelConfigured } from "@/lib/env";

export const REVIEW_DIGEST_FALLBACK_MODEL = "trnd-template/v1";

/**
 * Voice-of-customer mining: what people praise (themes), the phrases they
 * actually use (ready-made ad copy), and what ads must not overpromise
 * (recurring complaints). The model writes it; a deterministic frequency pass
 * stands in without a key, honestly labeled.
 */

const STOP = new Set(
  "the a an and or but so of to in on at for with was were is are it this that they i we my our you your had have has been very really just so much too also there here when after before again would could staff place time visit visited go went get got".split(
    " ",
  ),
);

/** Generic evaluative words — meaningless as a complaint theme ("great
 * facility, but…"). */
const EVALUATIVE = new Set(
  "great good nice amazing love loved awesome excellent best wonderful fantastic perfect facility experience recommend".split(" "),
);

function topWords(texts: string[], n: number, extraStop?: Set<string>): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const w of t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)) {
      if (w.length < 4 || STOP.has(w) || extraStop?.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  // With only a review or two, single mentions are the whole signal.
  const minCount = texts.length >= 3 ? 2 : 1;
  return [...counts.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w, c]) => (c > 1 ? `"${w}" (mentioned ${c}×)` : `"${w}"`));
}

/** Short, quotable fragments from 5-star reviews. */
function quotableFragments(reviews: Review[], n: number): string[] {
  return reviews
    .filter((r) => r.rating >= 5)
    .flatMap((r) => r.text.split(/[.!?]/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 90)
    .slice(0, n);
}

export function buildFallbackReviewDigest(business: Business, reviews: Review[]): NewReviewDigest {
  const own = reviews.filter((r) => r.competitor_id === null);
  const positive = own.filter((r) => r.rating >= 4).map((r) => r.text);
  const negative = own.filter((r) => r.rating <= 3).map((r) => r.text);
  return {
    business_id: business.id,
    review_count: own.length,
    themes: topWords(positive, 4),
    copy_hooks: quotableFragments(own, 3),
    // Praise words are meaningless as complaints — strip the evaluative
    // vocabulary so what's left is the actual friction.
    watchouts: negative.length > 0 ? topWords(negative, 3, EVALUATIVE) : [],
    model_used: REVIEW_DIGEST_FALLBACK_MODEL,
  };
}

export async function generateReviewDigest(
  business: Business,
  reviews: Review[],
): Promise<NewReviewDigest> {
  const own = reviews.filter((r) => r.competitor_id === null);
  if (isModelConfigured && own.length >= 3) {
    try {
      const { generateReviewDigestWithModel } = await import("@/lib/ai/openai");
      const { value, model } = await generateReviewDigestWithModel(
        business,
        own.map((r) => ({ rating: r.rating, text: r.text })),
      );
      return { business_id: business.id, review_count: own.length, ...value, model_used: model };
    } catch (err) {
      console.warn("[reviews] model digest failed — using deterministic fallback:", (err as Error).message);
    }
  }
  return buildFallbackReviewDigest(business, reviews);
}
