import type { TestWatch, TestWatchAd, TestWatchStage } from "@/lib/db/types";
import type { AdvertiserAd } from "@/lib/signals/adlibrary-apify";

/**
 * The free read's loop, as pure decisions: which new ad in the brand's
 * Ad Library is the brief going live, and what a day's read of the brand
 * says about a watched test. The daily job (lib/watch/check.ts) fetches
 * and stores; everything it decides is decided here, and tested.
 *
 * The Ad Library shows copy and start dates, never results, so the loop
 * reports survival: live, past three weeks, stopped. The emails say that
 * is a hint and not proof, the same way the read does.
 */

/** A watch that never finds its ad stops looking after this long. */
export const EXPIRE_DAYS = 45;
/** A live ad followed past this long ends the watch quietly. */
export const FOLLOW_DAYS = 180;
export const LONG_DAYS = 21;
/** Share of the brief's words an ad must carry to be its launch. */
export const MATCH_MIN = 0.5;
const MATCH_MIN_WORDS = 3;
/** Ads started this long before the watch began still count: a same-day launch lands on either side. */
const LAUNCH_GRACE_DAYS = 2;
/** The reader returns at most this many ads a brand; a full list can't prove an ad is gone. */
export const READ_CAP = 30;

const STOP = new Set(
  "the and for you your you're with this that are was were have has had not but all any can our out get got its it's just from they them their what when who why how too very more most into over than then there these those will would could should about after before because been being here only also some such each every one two three off yes".split(
    " ",
  ),
);

/** Words that carry meaning, lower-cased and de-duplicated. */
export function contentWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words)];
}

/** Share of the target's words the ad carries, and how many. */
export function overlap(adText: string, target: string): { share: number; shared: number } {
  const want = contentWords(target);
  if (want.length === 0) return { share: 0, shared: 0 };
  const have = new Set(contentWords(adText));
  const shared = want.filter((w) => have.has(w)).length;
  return { share: shared / want.length, shared };
}

function adText(ad: Pick<AdvertiserAd, "headline" | "snippet">): string {
  return [ad.headline, ad.snippet].filter(Boolean).join(" ");
}

const dayMs = 86400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
export function daysBetween(fromDay: string, to: Date): number | null {
  const t = Date.parse(`${fromDay.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((to.getTime() - t) / dayMs)) : null;
}

/**
 * The brand's new ad that is this brief: started around or after the watch
 * began, and carrying at least half the hook's words (three at least, or
 * all of a short hook). The on-screen line counts when it matches better,
 * since a creator often keeps the overlay and rewrites the voiceover.
 */
export function findLaunchedAd(ads: AdvertiserAd[], watch: Pick<TestWatch, "hook" | "on_screen" | "confirmed_at" | "created_at">): AdvertiserAd | null {
  const since = Date.parse(watch.confirmed_at ?? watch.created_at) - LAUNCH_GRACE_DAYS * dayMs;
  let best: { ad: AdvertiserAd; score: number } | null = null;
  for (const ad of ads) {
    if (ad.startedOn && Date.parse(`${ad.startedOn}T23:59:59Z`) < since) continue;
    const text = adText(ad);
    if (!text) continue;
    const scores = [watch.hook, watch.on_screen ?? ""].filter(Boolean).map((t) => {
      const o = overlap(text, t);
      const need = Math.min(MATCH_MIN_WORDS, contentWords(t).length);
      return o.share >= MATCH_MIN && o.shared >= need ? o.share : 0;
    });
    const score = Math.max(0, ...scores);
    if (score > 0 && (!best || score > best.score)) best = { ad, score };
  }
  return best?.ad ?? null;
}

export type RivalState = { state: "running"; days: number } | { state: "stopped" } | { state: "unknown"; days: number | null };

/** Whether the rival ad the test was modeled on is still in the rival's live ads. */
export function rivalState(rival: TestWatch["rival"], ads: AdvertiserAd[] | null, now: Date): RivalState {
  const days = rival?.startedOn ? daysBetween(rival.startedOn, now) : null;
  if (!rival || ads === null) return { state: "unknown", days };
  const still = ads.find((a) => a.active && overlap(adText(a), rival.text).share >= 0.8);
  if (still) return { state: "running", days: (still.startedOn ? daysBetween(still.startedOn, now) : days) ?? 0 };
  return ads.length >= READ_CAP ? { state: "unknown", days } : { state: "stopped" };
}

export interface WatchStep {
  patch: Partial<TestWatch>;
  /** The email this step sends, if any. */
  stage: TestWatchStage | null;
  /** Days the brand's ad has run (live, past three weeks) or ran (ended). */
  days: number | null;
}

const toStored = (ad: AdvertiserAd, missedSince?: string): TestWatchAd => ({
  id: ad.id,
  text: adText(ad).slice(0, 400),
  startedOn: ad.startedOn,
  url: ad.url,
  ...(missedSince ? { missedSince } : {}),
});

/**
 * One day's decision for one watch, from the brand's live ads (null when
 * the read failed, which decides nothing). An ad is only called stopped
 * after it is missing from two reads a day apart and the list was short
 * enough to be the whole account, so one flaky read never ends a test.
 */
export function stepWatch(watch: TestWatch, ads: AdvertiserAd[] | null, now: Date): WatchStep {
  const checked = { last_checked_at: now.toISOString() };
  const none: WatchStep = { patch: checked, stage: null, days: null };
  const sent = new Set(watch.stages_sent);
  const nowIso = now.toISOString();

  if (watch.status === "watching") {
    const found = ads ? findLaunchedAd(ads, watch) : null;
    if (found) {
      return {
        patch: { ...checked, status: "live", matched_ad: toStored(found), live_at: nowIso, stages_sent: [...sent, "live"] },
        stage: "live",
        days: found.startedOn ? daysBetween(found.startedOn, now) : 0,
      };
    }
    const since = daysBetween(dayOf(watch.confirmed_at ?? watch.created_at), now) ?? 0;
    if (since >= EXPIRE_DAYS) {
      return { patch: { ...checked, status: "expired", ended_at: nowIso, stages_sent: [...sent, "expired"] }, stage: "expired", days: null };
    }
    return none;
  }

  if (watch.status === "live" && watch.matched_ad) {
    if (ads === null) return none;
    const matched = watch.matched_ad;
    const days = matched.startedOn ? daysBetween(matched.startedOn, now) : null;
    const present = ads.find((a) => a.id === matched.id && a.active);
    if (present) {
      const cleared = matched.missedSince ? { matched_ad: toStored(present) } : {};
      if ((days ?? 0) >= FOLLOW_DAYS) return { patch: { ...checked, ...cleared, status: "ended", ended_at: nowIso }, stage: null, days };
      if ((days ?? 0) >= LONG_DAYS && !sent.has("past_three_weeks")) {
        return { patch: { ...checked, ...cleared, stages_sent: [...sent, "past_three_weeks"] }, stage: "past_three_weeks", days };
      }
      return { patch: { ...checked, ...cleared }, stage: null, days };
    }
    // A full list may have pushed a live ad off the end: that proves nothing.
    if (ads.length >= READ_CAP) return none;
    if (!matched.missedSince) return { patch: { ...checked, matched_ad: { ...matched, missedSince: nowIso } }, stage: null, days };
    if (now.getTime() - Date.parse(matched.missedSince) < 20 * 3600_000) return none;
    const ranFor = matched.startedOn ? daysBetween(matched.startedOn, new Date(matched.missedSince)) : null;
    return { patch: { ...checked, status: "ended", ended_at: nowIso, stages_sent: [...sent, "ended"] }, stage: "ended", days: ranFor };
  }

  return none;
}
