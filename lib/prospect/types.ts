/** Shared prospector shapes — pure types, importable from client and server. */

export type EmailStatus = "verified" | "risky" | "none";
export type LeadStatus = "new" | "queued" | "sent" | "opted_out" | "skipped";

export interface ProspectLead {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  website: string | null;
  platform: string;
  emails: string[];
  bestEmail: string | null;
  emailStatus: EmailStatus;
  /** Human one-liner for the table — "No ad pixel detected", "Meta pixel live". */
  signal: string;
  adPixels: string[];
  /** Google rating (1–5) and review count — null when Places didn't return them. */
  rating: number | null;
  reviewCount: number | null;
  /** Straight-line miles from the search center — null when it couldn't be resolved. */
  distanceMiles: number | null;
  status: LeadStatus;
  searchQuery: string;
  sentAt: string | null;
  createdAt: string;
}

/** One NDJSON line per event on /api/admin/prospector/run. */
export type RunEvent =
  | { type: "stage"; stage: 0 | 1 | 2 | 3 }
  | { type: "counts"; discovered: number; crawled: number; verified: number; ready: number }
  | { type: "status"; label: string }
  | { type: "lead"; lead: ProspectLead }
  | {
      type: "done";
      discovered: number;
      ready: number;
      skippedKnown: number;
      filteredAds: number;
      filteredNoEmail: number;
      filteredClosed: number;
      filteredFar: number;
      filteredChains: number;
      filteredDupes: number;
      filteredRisky: number;
      filteredLowFit: number;
    }
  | { type: "error"; reason: string };
