import { env, isPlacesConfigured } from "@/lib/env";

/**
 * Google Places (New) — the review/rating read for the business itself and
 * its named competitors. Key-gated; every caller handles null as "no read".
 */

export interface PlaceSummary {
  placeId: string;
  name: string;
  rating: number | null;
  reviewCount: number | null;
}

export interface PlaceReview {
  author: string;
  rating: number;
  text: string;
  publishedAt: string | null;
}

interface SearchTextResponse {
  places?: { id: string; displayName?: { text?: string }; rating?: number; userRatingCount?: number }[];
}

interface DetailsResponse {
  rating?: number;
  userRatingCount?: number;
  reviews?: {
    authorAttribution?: { displayName?: string };
    rating?: number;
    text?: { text?: string };
    publishTime?: string;
  }[];
}

async function placesFetch<T>(url: string, init: RequestInit, fieldMask: string): Promise<T | null> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": env.placesApiKey,
      "X-Goog-FieldMask": fieldMask,
      ...init.headers,
    },
  });
  if (!res.ok) {
    console.warn(`[places] ${res.status}:`, (await res.text()).slice(0, 200));
    return null;
  }
  return (await res.json()) as T;
}

/** Resolve a business by name + city to its place id and headline numbers. */
export async function findPlace(name: string, city: string, region?: string | null): Promise<PlaceSummary | null> {
  if (!isPlacesConfigured) return null;
  const data = await placesFetch<SearchTextResponse>(
    "https://places.googleapis.com/v1/places:searchText",
    { method: "POST", body: JSON.stringify({ textQuery: `${name} ${city}${region ? ` ${region}` : ""}` }) },
    "places.id,places.displayName,places.rating,places.userRatingCount",
  );
  const place = data?.places?.[0];
  if (!place) return null;
  return {
    placeId: place.id,
    name: place.displayName?.text ?? name,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
  };
}

/** The place's rating, count, and up to five most-relevant reviews. */
export async function fetchPlaceReviews(
  placeId: string,
): Promise<{ rating: number | null; reviewCount: number | null; reviews: PlaceReview[] } | null> {
  if (!isPlacesConfigured) return null;
  const data = await placesFetch<DetailsResponse>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    { method: "GET" },
    "rating,userRatingCount,reviews",
  );
  if (!data) return null;
  return {
    rating: data.rating ?? null,
    reviewCount: data.userRatingCount ?? null,
    reviews: (data.reviews ?? [])
      .filter((r) => typeof r.rating === "number" && (r.text?.text ?? "").length > 0)
      .map((r) => ({
        author: r.authorAttribution?.displayName ?? "A customer",
        rating: r.rating as number,
        text: (r.text?.text ?? "").slice(0, 1500),
        publishedAt: r.publishTime ?? null,
      })),
  };
}
