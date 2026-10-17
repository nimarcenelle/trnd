import type { Rival } from "@/lib/db/types";
import { isNoPageNote } from "@/lib/format";

/**
 * How good our data on a company is, 0-100: did we find the right Page,
 * read its ads recently and fully, match its ads to organic engagement, read
 * its site, and get its emails. A number a customer (or an investor) can
 * trust at a glance, and the first thing to look at when a report seems off.
 */

export interface CoverageParts {
  page: number; // of 25
  ads: number; // of 30
  quality: number; // of 15
  engagement: number; // of 15
  site: number; // of 10
  email: number; // of 5
}

export interface Coverage {
  score: number;
  label: "solid" | "thin" | "blind";
  parts: CoverageParts;
  /** The biggest gap, in words, or null at full marks. */
  gap: string | null;
}

const HOUR = 3_600_000;
const ageH = (at: string | null | undefined, now: number) => (at ? (now - Date.parse(at)) / HOUR : Infinity);

export const labelOf = (score: number): Coverage["label"] => (score >= 80 ? "solid" : score >= 50 ? "thin" : "blind");

export function coverage(
  rival: Pick<Rival, "page_id" | "page_source" | "last_error" | "last_scraped_at" | "website" | "email_status" | "health" | "site_checked_at">,
  ctx: { activeAds: number; engagedAds: number; inbox: boolean; now?: number },
): Coverage {
  const now = ctx.now ?? Date.now();
  const ads = rival.health?.ads;
  const site = rival.health?.site;

  const page = rival.page_id ? (rival.page_source ? 25 : 18) : isNoPageNote(rival.last_error) ? 8 : 0;

  let adsPts = 0;
  const adsAt = ads ? (ads.ok ? ads.at : null) : rival.last_error && !isNoPageNote(rival.last_error) ? null : rival.last_scraped_at;
  const a = ageH(adsAt, now);
  if (a <= 36) adsPts = 30;
  else if (a <= 72) adsPts = 20;
  else if (a < Infinity) adsPts = 8;

  let quality = 0;
  if (adsPts) quality = ads?.via === "api" ? 6 : ads?.note ? 9 : 15;

  // Many ads never run as organic posts, so matching 40% of them counts as full marks.
  const engagement = !adsPts ? 0 : ctx.activeAds === 0 ? 15 : Math.round(15 * Math.min(1, ctx.engagedAds / ctx.activeAds / 0.4));

  let sitePts = 0;
  if (!rival.website) sitePts = 10;
  else if (site) sitePts = !site.ok ? 0 : ageH(site.at, now) <= 36 ? 10 : 5;
  else sitePts = ageH(rival.site_checked_at, now) <= 36 ? 8 : 0;

  const email = !ctx.inbox ? 0 : rival.email_status === "receiving" ? 5 : rival.email_status === "subscribed" ? 2 : 0;

  const parts = { page, ads: adsPts, quality, engagement, site: sitePts, email };
  const score = page + adsPts + quality + engagement + sitePts + email;
  const misses: [number, string][] = [
    [25 - page, page === 0 ? "Facebook Page not found" : page === 8 ? "no Facebook Page running ads" : "Page not yet confirmed"],
    [30 - adsPts, adsPts === 0 ? "ads not read" : "ads read a while ago"],
    [15 - quality, ads?.via === "api" ? "EU-only ads, no images" : "partial ad read"],
    [15 - engagement, "few ads matched to organic engagement"],
    [10 - sitePts, "website not read"],
    [5 - email, ctx.inbox ? "emails not arriving" : "email tracking off"],
  ];
  const worst = misses.sort((x, y) => y[0] - x[0])[0];
  return { score, label: labelOf(score), parts, gap: worst[0] > 0 ? worst[1] : null };
}

/** The average over the companies watched. */
export function overallCoverage(scores: number[]): { score: number; label: Coverage["label"] } | null {
  if (!scores.length) return null;
  const score = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  return { score, label: labelOf(score) };
}
