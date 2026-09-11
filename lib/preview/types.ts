import type { SignalSource } from "@/lib/db/types";

/**
 * The public demand snapshot: what TRND can say about a business from its
 * website alone, before anyone signs up. Every field is either read from
 * their own site or measured from a named source — there is no field here
 * that a stranger couldn't check.
 */

/** One line of proof, in the order the pipeline produced it. */
export interface SnapshotFinding {
  /** What kind of knowing this is — the page groups by it. */
  kind: "site" | "place" | "demand" | "competition" | "calendar";
  headline: string;
  detail?: string;
  /** Where it can be checked, when the source has a page. */
  url?: string | null;
}

export interface SnapshotDemandRead {
  term: string;
  /** Week-over-week movement where a source measured one. */
  deltaPct: number | null;
  /** 0-100 search interest (Google's scale) when that's what was read. */
  interestLevel: number | null;
  /** Buying-intent phrasings found in autocomplete ("near me", "cost"). */
  intentCount: number | null;
  /** Humanized geo — "Atlanta metro", "Georgia", "US-wide". */
  geoLabel: string;
  source: SignalSource;
  url: string | null;
  /** False when the read is an intent or forecast heuristic, not a measure. */
  measured: boolean;
}

export interface SnapshotCompetition {
  term: string;
  /** Active ads matching the term in this city, when the read landed. */
  activeAds: number | null;
  advertisers: string[];
  /** One real line of what a rival is saying — the thing owners react to. */
  sample: string | null;
  url: string | null;
}

export interface SnapshotMoment {
  label: string;
  daysOut: number;
  leadWeeks: number;
  advice: string;
}

/** The written ad — the same generator the product uses, one pick deep. */
export interface SnapshotAd {
  term: string;
  hook: string;
  angle: string;
  offer: string;
  who: string;
  headlines: string[];
  primaryText: string | null;
  /** Which service on their menu the ad is written against. */
  service: string | null;
}

export interface SnapshotBusiness {
  name: string;
  category: string;
  city: string | null;
  region: string | null;
  website: string;
  priceBand: string | null;
  services: { name: string; price: string }[];
  photo: string | null;
}

export interface DemandSnapshot {
  business: SnapshotBusiness;
  /** "Atlanta metro" when the city resolved to a DMA, else the state/US. */
  metroLabel: string;
  findings: SnapshotFinding[];
  demand: SnapshotDemandRead[];
  competition: SnapshotCompetition[];
  moments: SnapshotMoment[];
  ad: SnapshotAd | null;
  /** Sources that were asked and came back empty — said out loud, not hidden. */
  quiet: string[];
  modelUsed: string;
  generatedAt: string;
}

/** Streamed while the snapshot is being built — the wait is the product. */
export type SnapshotEvent =
  | { type: "status"; label: string }
  | { type: "finding"; finding: SnapshotFinding }
  | { type: "done"; token: string; snapshot: DemandSnapshot }
  | { type: "error"; reason: string };
