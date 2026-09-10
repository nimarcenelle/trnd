import { env, isPlacesConfigured } from "@/lib/env";

/**
 * Google Places (New) text search for the prospector — one query per business
 * type, restricted to a box around the target location, paginated up to the
 * lead cap. Same request shape as lib/reviews/places.ts. Rating, review
 * count, and open/closed status ride along on the same Enterprise-tier field
 * mask the website field already requires, so they cost nothing extra.
 */

export interface DiscoveredPlace {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  distanceMiles: number | null;
  /** Places businessStatus — "OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY", or unknown. */
  businessStatus: string | null;
}

interface SearchTextResponse {
  places?: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    websiteUri?: string;
    nationalPhoneNumber?: string;
    primaryTypeDisplayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
  }[];
  nextPageToken?: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

async function searchText(body: object, fieldMask: string): Promise<SearchTextResponse | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": env.placesApiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`[prospect] places ${res.status}:`, (await res.text()).slice(0, 200));
    return null;
  }
  return (await res.json()) as SearchTextResponse;
}

/** Center of the target area, resolved by searching for the location itself. */
async function geocode(location: string): Promise<LatLng | null> {
  const data = await searchText({ textQuery: location }, "places.location");
  const loc = data?.places?.[0]?.location;
  return typeof loc?.latitude === "number" && typeof loc?.longitude === "number"
    ? { latitude: loc.latitude, longitude: loc.longitude }
    : null;
}

/** "City, ST" split off a formattedAddress like "123 Main St, Yucca Valley, CA 92284, USA". */
function cityRegion(address: string | undefined): { city: string | null; region: string | null } {
  const m = address?.match(/,\s*([^,]+),\s*([A-Z]{2})\b[^,]*(?:,\s*USA)?$/);
  return m ? { city: m[1].trim(), region: m[2] } : { city: null, region: null };
}

/** Great-circle distance in miles. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Text Search only restricts to a rectangle (circles are bias-only), so the
 * box circumscribes the radius and the haversine check trims the corners.
 */
export function boundingBox(center: LatLng, radiusMiles: number): { low: LatLng; high: LatLng } {
  const dLat = radiusMiles / 69;
  const dLng = radiusMiles / (69 * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01));
  return {
    low: { latitude: center.latitude - dLat, longitude: center.longitude - dLng },
    high: { latitude: center.latitude + dLat, longitude: center.longitude + dLng },
  };
}

const PAGE_FIELDS =
  "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.primaryTypeDisplayName,places.location,places.rating,places.userRatingCount,places.businessStatus,nextPageToken";

/**
 * Every place matching the given business types near the location, deduped by
 * place id, capped. Radius arrives in miles from the UI. Places outside the
 * radius are returned with their distance so the pipeline can count them.
 */
export async function discoverPlaces(opts: {
  location: string;
  radiusMiles: number;
  categories: string[];
  cap: number;
  onProgress?: (found: number) => void;
}): Promise<DiscoveredPlace[]> {
  if (!isPlacesConfigured) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  const center = await geocode(opts.location);
  const box = center ? boundingBox(center, Math.min(opts.radiusMiles, 100)) : null;
  const out: DiscoveredPlace[] = [];
  const seen = new Set<string>();

  for (const category of opts.categories) {
    let pageToken: string | undefined;
    for (let page = 0; page < 3 && out.length < opts.cap; page++) {
      // Paging requests must repeat the initial request's parameters exactly
      // (the API 400s otherwise) — only pageToken is added.
      const body: Record<string, unknown> = {
        textQuery: `${category} near ${opts.location}`,
        ...(box ? { locationRestriction: { rectangle: box } } : {}),
        ...(pageToken ? { pageToken } : {}),
      };
      const data = await searchText(body, PAGE_FIELDS);
      for (const p of data?.places ?? []) {
        if (out.length >= opts.cap || seen.has(p.id)) continue;
        seen.add(p.id);
        const loc = p.location;
        const here =
          typeof loc?.latitude === "number" && typeof loc?.longitude === "number"
            ? { latitude: loc.latitude, longitude: loc.longitude }
            : null;
        out.push({
          placeId: p.id,
          name: p.displayName?.text ?? "Unknown",
          category: p.primaryTypeDisplayName?.text ?? null,
          address: p.formattedAddress ?? null,
          ...cityRegion(p.formattedAddress),
          phone: p.nationalPhoneNumber ?? null,
          website: p.websiteUri ?? null,
          rating: typeof p.rating === "number" ? p.rating : null,
          reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
          distanceMiles: center && here ? Math.round(distanceMiles(center, here) * 10) / 10 : null,
          businessStatus: p.businessStatus ?? null,
        });
      }
      opts.onProgress?.(out.length);
      pageToken = data?.nextPageToken;
      if (!pageToken) break;
    }
    if (out.length >= opts.cap) break;
  }
  return out;
}
