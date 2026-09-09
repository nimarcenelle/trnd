import { describeSignal, pickBestEmail, readProspectSite } from "./crawl";
import { discoverPlaces, type DiscoveredPlace } from "./discover";
import { knownPlaceIds, saveLead } from "./store";
import type { ProspectLead, RunEvent } from "./types";
import { verifyEmailDomain } from "./verify";

/**
 * The whole prospecting run: Places discovery → per-site crawl → DNS email
 * check → persist. Streams RunEvents so the UI can narrate; wall-clock
 * budgeted like the ingest cron so a big radius can't 504 the route.
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
}

const CRAWL_CONCURRENCY = 4;
const BUDGET_MS = 240_000;

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

  const known = await knownPlaceIds();
  const fresh = places.filter((p) => !known.has(p.placeId));
  const skippedKnown = places.length - fresh.length;
  if (skippedKnown > 0) {
    send({ type: "status", label: `${skippedKnown} already in the leads table — skipped` });
  }

  send({ type: "stage", stage: 1 });
  let filteredAds = 0;
  let filteredNoEmail = 0;

  const processOne = async (place: DiscoveredPlace): Promise<void> => {
    if (overBudget()) return;
    const read = place.website ? await readProspectSite(place.website) : null;
    if (place.website) {
      counts.crawled++;
      emitCounts();
    }
    if (params.onlyNoAds && read && read.adPixels.length > 0) {
      filteredAds++;
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
      filteredNoEmail++;
      return;
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
      bestEmail: emailStatus === "none" ? null : bestEmail,
      emailStatus,
      signal: describeSignal(read, Boolean(place.website)),
      adPixels: read?.adPixels ?? [],
      status: "new",
      searchQuery,
      sentAt: null,
      createdAt: new Date().toISOString(),
    };
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
    filteredAds,
    filteredNoEmail,
  });
}
