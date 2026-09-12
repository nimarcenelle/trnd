import type { Repo } from "@/lib/db/repo";
import type { Business, NewReview } from "@/lib/db/types";
import { isPlacesConfigured } from "@/lib/env";
import { evaluateAlerts } from "@/lib/alerts/engine";
import { fetchAdLibraryRead } from "@/lib/signals/adlibrary";
import { generateReviewDigest } from "@/lib/reviews/digest";
import { fetchPlaceReviews, findPlace } from "@/lib/reviews/places";

/**
 * The business-intel half of daily ingestion: own + competitor reviews (via
 * Google Places, key-gated), competitor ad-library reads (headless render,
 * no key), the review digest, and the alert pass. Every step tolerates
 * failure — a business's intel run always completes with what it could get.
 */

export { AD_COUNT_LOCAL_MAX } from "@/lib/scoring";
import { AD_COUNT_LOCAL_MAX } from "@/lib/scoring";

export interface IntelIngestSummary {
  businessId: string;
  reviewsWritten: number;
  competitorReads: number;
  alertsCreated: number;
  /** Own + rival posts written, and rival ad reads (Meta via Apify, Google). */
  socialPosts?: number;
  rivalAdReads?: number;
}

async function ingestOwnReviews(repo: Repo, business: Business): Promise<number> {
  if (!isPlacesConfigured) return 0;
  const gbp = await repo.getConnection(business.id, "google_business");
  let placeId = gbp?.account_id ?? null;
  if (!placeId) {
    const place = await findPlace(business.name, business.city, business.region);
    if (!place) return 0;
    placeId = place.placeId;
    // Remember the resolution so tomorrow's run skips the search call.
    await repo.upsertConnection({
      business_id: business.id,
      provider: "google_business",
      status: "connected",
      account_id: placeId,
      account_name: place.name,
      access_token: "places-api",
      refresh_token: null,
      token_expires_at: null,
      scopes: ["places.reviews"],
    });
  }
  const details = await fetchPlaceReviews(placeId);
  if (!details) return 0;
  const rows: NewReview[] = details.reviews.map((r) => ({
    business_id: business.id,
    competitor_id: null,
    author: r.author,
    rating: r.rating,
    text: r.text,
    published_at: r.publishedAt,
    source: "google",
  }));
  const written = await repo.upsertReviews(rows);
  // Regenerate the digest when the picture changed.
  const all = await repo.listReviews(business.id, { competitorId: null });
  const digest = await repo.getReviewDigest(business.id);
  if (all.length > 0 && (!digest || digest.review_count !== all.length)) {
    await repo.upsertReviewDigest(await generateReviewDigest(business, all));
  }
  return written;
}

async function ingestCompetitors(repo: Repo, business: Business): Promise<number> {
  const competitors = await repo.listCompetitors(business.id);
  if (competitors.length === 0) return 0;
  let written = 0;

  // ---- ad-library reads (renderer-gated, no API key). When the paid Apify
  // read is configured it replaces this path (lib/intel/social-ingest.ts):
  // it works in serverless prod, reads by Page rather than keyword, and
  // carries how long each ad has run.
  const { isAdLibraryApifyAvailable } = await import("@/lib/signals/adlibrary-apify");
  if (!isAdLibraryApifyAvailable()) try {
    const { getRenderer } = await import("@/lib/import/render");
    const renderer = await getRenderer();
    if (renderer) {
      try {
        for (const c of competitors) {
          try {
            const read = await fetchAdLibraryRead(renderer, c.name);
            if (!read) continue;
            // The keyword search matches nationally: creatives are kept only
            // when the advertiser actually is this competitor, and a
            // franchise-scale total is labeled as such — never presented as
            // a local count. Wall/age-gate artifacts are not ad copy.
            const name = c.name.toLowerCase();
            const isThem = (adv: string) => {
              const a = adv.toLowerCase();
              return a.includes(name) || name.includes(a);
            };
            const creatives = read.ads
              .filter((a) => isThem(a.advertiser) && !/confirm your age|log in to|log in$/i.test(a.snippet))
              .slice(0, 3);
            const franchiseScale = typeof read.total === "number" && read.total > AD_COUNT_LOCAL_MAX;
            written += await repo.upsertCompetitorReads([
              {
                competitor_id: c.id,
                business_id: business.id,
                kind: "ads",
                value: read.total,
                rating: null,
                summary: franchiseScale
                  ? `advertising at brand scale (~${read.total} keyword matches nationally — not a local count)`
                  : `${read.total ?? creatives.length} active Meta ad${read.total === 1 ? "" : "s"}`,
                raw: { ads: creatives },
              },
            ]);
          } catch (err) {
            console.warn(`[intel] ad read for ${c.name} failed:`, (err as Error).message);
          }
        }
      } finally {
        await renderer.close();
      }
    }
  } catch (err) {
    console.warn("[intel] renderer unavailable for competitor ads:", (err as Error).message);
  }

  // ---- rating/review reads (Places-gated)
  if (isPlacesConfigured) {
    for (const c of competitors) {
      try {
        let placeId = c.place_id;
        if (!placeId) {
          const place = await findPlace(c.name, business.city, business.region);
          if (!place) continue;
          placeId = place.placeId;
          await repo.updateCompetitor(c.id, { place_id: placeId });
        }
        const details = await fetchPlaceReviews(placeId);
        if (!details) continue;
        written += await repo.upsertCompetitorReads([
          {
            competitor_id: c.id,
            business_id: business.id,
            kind: "reviews",
            value: details.reviewCount,
            rating: details.rating,
            summary: `${details.rating ?? "—"}★ across ${details.reviewCount ?? 0} reviews`,
            raw: {},
          },
        ]);
        await repo.upsertReviews(
          details.reviews.map((r) => ({
            business_id: business.id,
            competitor_id: c.id,
            author: r.author,
            rating: r.rating,
            text: r.text,
            published_at: r.publishedAt,
            source: "google" as const,
          })),
        );
      } catch (err) {
        console.warn(`[intel] places read for ${c.name} failed:`, (err as Error).message);
      }
    }
  }

  return written;
}

export async function runIntelIngestForBusiness(
  repo: Repo,
  business: Business,
): Promise<IntelIngestSummary> {
  const summary: IntelIngestSummary = {
    businessId: business.id,
    reviewsWritten: 0,
    competitorReads: 0,
    alertsCreated: 0,
  };
  try {
    summary.reviewsWritten = await ingestOwnReviews(repo, business);
  } catch (err) {
    console.warn(`[intel] own reviews failed for ${business.id}:`, (err as Error).message);
  }
  try {
    summary.competitorReads = await ingestCompetitors(repo, business);
  } catch (err) {
    console.warn(`[intel] competitors failed for ${business.id}:`, (err as Error).message);
  }
  // ---- the social and paid-ad reads: own accounts, direct rivals' accounts,
  // and what those rivals are paying to show.
  try {
    const { ingestRivalAds, ingestSocialAccounts } = await import("@/lib/intel/social-ingest");
    const competitors = await repo.listCompetitors(business.id);
    const social = await ingestSocialAccounts(repo, business, competitors);
    summary.socialPosts = social.ownPosts + social.rivalPosts;
    summary.competitorReads += social.rivalReads;
    summary.rivalAdReads = await ingestRivalAds(repo, business, competitors);
    summary.competitorReads += summary.rivalAdReads;
  } catch (err) {
    console.warn(`[intel] social and rival ads failed for ${business.id}:`, (err as Error).message);
  }
  try {
    summary.alertsCreated = (await evaluateAlerts(repo, business)).length;
  } catch (err) {
    console.warn(`[intel] alerts failed for ${business.id}:`, (err as Error).message);
  }
  return summary;
}

/**
 * Self-heal for pages that depend on intel — covers businesses whose
 * background jobs died or that onboarded before a feature existed. Two
 * independent checks, each a no-op once satisfied:
 * 1. Listing never resolved → run the reviews/competitor intel ingest.
 * 2. No demand reads (news/ads) for any watch term in 7 days → run the
 *    targeted signal ingest, then re-rank so the picks see the fresh reads.
 */
export async function ensureIntelFresh(repo: Repo, business: Business): Promise<void> {
  if (isPlacesConfigured && !(await repo.getConnection(business.id, "google_business"))) {
    await runIntelIngestForBusiness(repo, business);
  }

  const brief = await repo.getBusinessBrief(business.id);
  const watchTerms = brief?.watch_terms ?? [];
  if (watchTerms.length === 0) return;
  const { normalizeTerm } = await import("@/lib/signals/normalize");
  const anchors = watchTerms.map(normalizeTerm);
  const signals = await repo.listSignalsForCategory(business.category, {
    sinceDays: 7,
    geo: business.region ? `US-${business.region.toUpperCase()}` : undefined,
  });
  const hasDemandReads = signals.some(
    (s) =>
      (s.metric_type === "news_coverage" ||
        s.metric_type === "ad_saturation" ||
        s.metric_type === "search_volume") &&
      anchors.some((a) => s.normalized_term === a || s.normalized_term.startsWith(`${a}_`)),
  );
  if (hasDemandReads) return;
  const { runSignalIngestForBusiness } = await import("@/lib/signals/ingest");
  const written = await runSignalIngestForBusiness(repo, business);
  if (written > 0) {
    const { rerankWeek } = await import("@/lib/recommend/rerank");
    await rerankWeek(repo, business);
  }
}

export async function runIntelIngest(repo: Repo): Promise<IntelIngestSummary[]> {
  const out: IntelIngestSummary[] = [];
  for (const b of await repo.listAllBusinesses()) {
    out.push(await runIntelIngestForBusiness(repo, b));
  }
  return out;
}
