import { env, isPlacesConfigured } from "@/lib/env";

/**
 * Google Places (New) text search for the prospector — one query per business
 * type, biased to a circle around the target location, paginated up to the
 * lead cap. Same request shape as lib/reviews/places.ts.
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
  }[];
  nextPageToken?: string;
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
async function geocode(location: string): Promise<{ latitude: number; longitude: number } | null> {
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

const PAGE_FIELDS =
  "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.primaryTypeDisplayName,nextPageToken";

/**
 * Every place matching the given business types near the location, deduped by
 * place id, capped. Radius arrives in miles from the UI.
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
  const radiusMeters = Math.min(opts.radiusMiles * 1609, 50_000);
  const out: DiscoveredPlace[] = [];
  const seen = new Set<string>();

  for (const category of opts.categories) {
    let pageToken: string | undefined;
    for (let page = 0; page < 3 && out.length < opts.cap; page++) {
      // Paging requests must repeat the initial request's parameters exactly
      // (the API 400s otherwise) — only pageToken is added.
      const body: Record<string, unknown> = {
        textQuery: `${category} near ${opts.location}`,
        ...(center ? { locationBias: { circle: { center, radius: radiusMeters } } } : {}),
        ...(pageToken ? { pageToken } : {}),
      };
      const data = await searchText(body, PAGE_FIELDS);
      for (const p of data?.places ?? []) {
        if (out.length >= opts.cap || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push({
          placeId: p.id,
          name: p.displayName?.text ?? "Unknown",
          category: p.primaryTypeDisplayName?.text ?? null,
          address: p.formattedAddress ?? null,
          ...cityRegion(p.formattedAddress),
          phone: p.nationalPhoneNumber ?? null,
          website: p.websiteUri ?? null,
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
