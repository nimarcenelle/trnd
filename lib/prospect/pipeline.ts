import { describeSignal, pickBestEmail, readProspectSite } from "./crawl";
import { discoverPlaces, type DiscoveredPlace } from "./discover";
import { isChainName, isSharedHost, rootDomain, scoreFit } from "./fit";
import { knownEmails, knownPlaceIds, saveLead } from "./store";
import type { ProspectLead, RunEvent } from "./types";
import { verifyEmailDomain } from "./verify";

/**
 * The whole prospecting run: Places discovery → per-site crawl → DNS email
 * check → fit score → persist. Streams RunEvents so the UI can narrate;
 * wall-clock budgeted like the ingest cron so a big radius can't 504 the route.
 */

export interface RunParams {
  location: string;
  radiusMiles: number;
  categories: string[];
  cap: number;
  onlyNoAds: boolean;
  /** Drop leads with no deliverable email — the run only lands leads you can
   * actually queue for outreach. */
  onlyWithEmail: boolean;
  /** Drop leads whose email domain has no MX record (the "risky" tier). */
  onlyVerified: boolean;
  /** Drop well-known chain brands and any domain shared by 3+ places in the run. */
  skipChains: boolean;
  /** Drop leads scoring below this fit (0 keeps everything). */
  minFit: number;
}

const CRAWL_CONCURRENCY = 4;
const BUDGET_MS = 240_000;
const CHAIN_DOMAIN_COUNT = 3;

/** Domains that appear on CHAIN_DOMAIN_COUNT+ places in one run — franchises. */
export function chainDomains(places: Pick<DiscoveredPlace, "website">[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of places) {
    const d = rootDomain(p.website);
    if (!d || isSharedHost(d)) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= CHAIN_DOMAIN_COUNT).map(([d]) => d));
}

export async function runProspectPipeline(
  params: RunParams,
  send: (event: RunEvent) => void,
): Promise<void> {
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > BUDGET_MS;
  const counts = { discovered: 0, crawled: 0, verified: 0, ready: 0 };
  const emitCounts = () => send({ type: "counts", ...counts });
  const searchQuery = `${params.categories.join(", ")} · ${params.location} · ${params.radiusMiles}mi`;

  send({ type: "stage", stage: 0 });
  send({ type: "status", label: `Searching Places for ${params.categories.join(", ")}…` });
  const places = await discoverPlaces({
    location: params.location,
    radiusMiles: params.radiusMiles,
    categories: params.categories,
    cap: params.cap,
    onProgress: (found) => {
      counts.discovered = found;
      emitCounts();
    },
  });
  counts.discovered = places.length;
  emitCounts();

  const filtered = {
    closed: 0,
    far: 0,
    chains: 0,
    dupes: 0,
    ads: 0,
    noEmail: 0,
    risky: 0,
    lowFit: 0,
  };

  // Cheap pre-crawl filters — everything Places already told us.
  const known = await knownPlaceIds();
  const chains = params.skipChains ? chainDomains(places) : new Set<string>();
  const fresh: DiscoveredPlace[] = [];
  let skippedKnown = 0;
  for (const p of places) {
    if (known.has(p.placeId)) {
      skippedKnown++;
      continue;
    }
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") {
      filtered.closed++;
      continue;
    }
    if (p.distanceMiles !== null && p.distanceMiles > params.radiusMiles) {
      filtered.far++;
      continue;
    }
    const domain = rootDomain(p.website);
    if (params.skipChains && (isChainName(p.name) || (domain && chains.has(domain)))) {
      filtered.chains++;
      continue;
    }
    fresh.push(p);
  }
  if (skippedKnown > 0) send({ type: "status", label: `${skippedKnown} already in the leads table — skipped` });
  const preFiltered = filtered.closed + filtered.far + filtered.chains;
  if (preFiltered > 0) send({ type: "status", label: `${preFiltered} dropped before crawl (closed, out of range, or chain)` });

  // One founder email per inbox, ever — across runs, not just this one.
  const seenEmails = await knownEmails();

  send({ type: "stage", stage: 1 });

  const processOne = async (place: DiscoveredPlace): Promise<void> => {
    if (overBudget()) return;
    const read = place.website ? await readProspectSite(place.website) : null;
    if (place.website) {
      counts.crawled++;
      emitCounts();
    }
    if (params.onlyNoAds && read && read.adPixels.length > 0) {
      filtered.ads++;
      return;
    }
    const siteHost = place.website ? new URL(place.website).hostname : null;
    const bestEmail = read ? pickBestEmail(read.emails, siteHost) : null;
    let emailStatus: ProspectLead["emailStatus"] = "none";
    if (bestEmail) {
      emailStatus = await verifyEmailDomain(bestEmail);
      counts.verified++;
      emitCounts();
    }
    if (params.onlyWithEmail && emailStatus === "none") {
      filtered.noEmail++;
      return;
    }
    if (params.onlyVerified && bestEmail && emailStatus === "risky") {
      filtered.risky++;
      return;
    }
    const finalEmail = emailStatus === "none" ? null : bestEmail;
    if (finalEmail) {
      const key = finalEmail.toLowerCase();
      if (seenEmails.has(key)) {
        filtered.dupes++;
        return;
      }
      seenEmails.add(key);
    }
    const lead: ProspectLead = {
      placeId: place.placeId,
      name: place.name,
      category: place.category,
      address: place.address,
      city: place.city,
      region: place.region,
      phone: place.phone,
      website: place.website,
      platform: place.website ? (read?.platform ?? "Unreadable") : "None",
      emails: read?.emails ?? [],
      bestEmail: finalEmail,
      emailStatus,
      signal: describeSignal(read, Boolean(place.website)),
      adPixels: read?.adPixels ?? [],
      rating: place.rating,
      reviewCount: place.reviewCount,
      distanceMiles: place.distanceMiles,
      status: "new",
      searchQuery,
      sentAt: null,
      createdAt: new Date().toISOString(),
    };
    if (params.minFit > 0 && scoreFit(lead).score < params.minFit) {
      filtered.lowFit++;
      return;
    }
    await saveLead(lead);
    counts.ready++;
    emitCounts();
    send({ type: "lead", lead });
  };

  // Small worker pool — polite to the sites, fast enough for a 50-lead cap.
  let next = 0;
  const workers = Array.from({ length: CRAWL_CONCURRENCY }, async () => {
    while (next < fresh.length && !overBudget()) {
      const place = fresh[next++];
      try {
        await processOne(place);
      } catch (err) {
        console.warn(`[prospect] ${place.name}:`, err instanceof Error ? err.message : err);
      }
    }
  });
  await Promise.all(workers);

  if (overBudget()) {
    send({ type: "status", label: "Time budget reached — run again to continue where this left off" });
  }
  send({
    type: "done",
    discovered: places.length,
    ready: counts.ready,
    skippedKnown,
    filteredAds: filtered.ads,
    filteredNoEmail: filtered.noEmail,
    filteredClosed: filtered.closed,
    filteredFar: filtered.far,
    filteredChains: filtered.chains,
    filteredDupes: filtered.dupes,
    filteredRisky: filtered.risky,
    filteredLowFit: filtered.lowFit,
  });
}
