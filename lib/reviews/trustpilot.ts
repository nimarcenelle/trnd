import { env } from "@/lib/env";
import { CircuitBreaker } from "@/lib/signals/http";
import { runActorSync } from "@/lib/social/apify";

/**
 * Trustpilot, for an online brand and its rivals. A DTC brand has no Google
 * listing to read reviews from, and its rivals have none either, so the
 * "competitor weakness" read (what customers complain about at the rival
 * that they do not complain about here) had no source at all for the
 * brands the product is sold to. Trustpilot's pages are behind Cloudflare;
 * the store's actor reads them at $0.005 a run plus $0.0006 a review, and
 * a brand with no Trustpilot page simply returns nothing.
 *
 * Verified 2026-09-14 against a live run: items carry reviewId, title,
 * text, rating, publishedDate, authorName, companyName. Every field is
 * optional in the mapper.
 */

const DEFAULT_ACTOR = "automation-lab/trustpilot";
/** Reviews read per company per read: enough to count themes, capped for the bill. */
export const REVIEWS_PER_COMPANY = 40;
const TEXT_CHARS = 600;

export interface TrustpilotReview {
  externalId: string;
  author: string;
  rating: number;
  text: string;
  publishedAt: string | null;
}

export function trustpilotUrl(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return `https://www.trustpilot.com/review/${host}`;
}

type Item = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Pure: the actor's items into reviews. A review with no rating or no words is not a review. */
export function toTrustpilotReviews(items: unknown[]): TrustpilotReview[] {
  const out: TrustpilotReview[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Item;
    const id = str(i.reviewId ?? i.id ?? i.reviewUrl);
    const rating = Number(i.rating);
    const body = [str(i.title), str(i.text)].filter(Boolean).join(". ").slice(0, TEXT_CHARS);
    if (!id || seen.has(id) || !Number.isFinite(rating) || rating <= 0 || !body) continue;
    seen.add(id);
    const at = Date.parse(str(i.publishedDate ?? i.experienceDate));
    out.push({
      externalId: id,
      author: str(i.authorName ?? i.author).slice(0, 80) || "Trustpilot reviewer",
      rating: Math.max(1, Math.min(5, Math.round(rating))),
      text: body,
      publishedAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
    });
  }
  return out;
}

const breaker = new CircuitBreaker("trustpilot");

export function isTrustpilotAvailable(): boolean {
  return Boolean(env.apifyToken);
}

/** A company's recent reviews, or [] without a key, without a page, or on a dead actor. */
export async function fetchTrustpilotReviews(domain: string, opts: { max?: number } = {}): Promise<TrustpilotReview[]> {
  if (!isTrustpilotAvailable() || !domain.trim()) return [];
  try {
    const items = await runActorSync<unknown>(
      DEFAULT_ACTOR,
      { companyUrls: [trustpilotUrl(domain)], maxReviewsPerCompany: opts.max ?? REVIEWS_PER_COMPANY, sort: "recency", includeCompanyInfo: false },
      { breaker },
    );
    return toTrustpilotReviews(items);
  } catch (err) {
    console.warn(`[reviews:trustpilot] ${domain} failed:`, (err as Error).message);
    return [];
  }
}
