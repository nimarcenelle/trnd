import type { Repo } from "@/lib/db/repo";
import type { TestWatch } from "@/lib/db/types";
import { stageEmail, type WatchEmail } from "@/lib/email/test-watch";
import { sendEmail } from "@/lib/email/send";
import { fetchAdvertiserAds, isAdLibraryApifyAvailable, isRivalAd, type AdvertiserAd } from "@/lib/signals/adlibrary-apify";

import { rivalState, stepWatch, type RivalState } from "./match";

/**
 * The daily pass over every watched test: one Ad Library read per brand
 * (several people watching one brand share it), a decision per watch
 * (lib/watch/match.ts), and the email that decision calls for. The rival
 * the test was modeled on is read only when an email is about to go, so a
 * quiet day costs one read per brand.
 *
 * A read that fails decides nothing and is tried tomorrow. An email that
 * fails to send leaves the watch where it was, so it is sent tomorrow
 * instead of skipped.
 */

export interface CheckDeps {
  fetchAds?: (name: string) => Promise<AdvertiserAd[]>;
  send?: (to: string, email: WatchEmail) => Promise<boolean>;
  available?: () => boolean;
  now?: Date;
  budgetMs?: number;
}

export interface CheckResult {
  brands: number;
  checked: number;
  emailed: number;
  skipped: string | null;
}

export async function checkWatches(repo: Repo, deps: CheckDeps = {}): Promise<CheckResult> {
  const now = deps.now ?? new Date();
  if (!(deps.available ?? isAdLibraryApifyAvailable)()) return { brands: 0, checked: 0, emailed: 0, skipped: "APIFY_TOKEN unset" };
  const fetchAds = deps.fetchAds ?? ((name: string) => fetchAdvertiserAds(name));
  const send = deps.send ?? (async (to, email) => (await sendEmail({ to, subject: email.subject, html: email.html })).ok);
  const deadline = Date.now() + (deps.budgetMs ?? 240_000);

  const watches = await repo.listTestWatches({ statuses: ["watching", "live"] });
  const byBrand = new Map<string, TestWatch[]>();
  for (const w of watches) {
    const k = w.brand_name.toLowerCase();
    byBrand.set(k, [...(byBrand.get(k) ?? []), w]);
  }

  const rivalReads = new Map<string, Promise<AdvertiserAd[] | null>>();
  const readRival = (name: string) => {
    if (!rivalReads.has(name)) {
      rivalReads.set(
        name,
        fetchAds(name)
          .then((ads) => ads.filter((a) => isRivalAd({ name }, a)))
          .catch(() => null),
      );
    }
    return rivalReads.get(name) as Promise<AdvertiserAd[] | null>;
  };

  let brands = 0;
  let checked = 0;
  let emailed = 0;
  for (const group of byBrand.values()) {
    if (Date.now() > deadline) break;
    brands += 1;
    const name = group[0].brand_name;
    let ads: AdvertiserAd[] | null;
    try {
      ads = (await fetchAds(name)).filter((a) => isRivalAd({ name }, a));
    } catch (err) {
      console.warn(`[watch] Ad Library read for ${name} failed; tomorrow decides:`, (err as Error).message);
      ads = null;
    }
    for (const watch of group) {
      checked += 1;
      const step = stepWatch(watch, ads, now);
      if (step.stage) {
        const next = { ...watch, ...step.patch } as TestWatch;
        const rival: RivalState = next.rival ? rivalState(next.rival, await readRival(next.rival.advertiser), now) : { state: "unknown", days: null };
        const ok = await send(next.email, stageEmail(next, step.stage as Exclude<typeof step.stage, "confirm">, step.days, rival)).catch(() => false);
        if (!ok) {
          await repo.updateTestWatch(watch.id, { last_checked_at: now.toISOString() }).catch(() => undefined);
          continue;
        }
        emailed += 1;
      }
      await repo.updateTestWatch(watch.id, step.patch).catch((err) => console.warn(`[watch] saving ${watch.id} failed:`, (err as Error).message));
    }
  }
  return { brands, checked, emailed, skipped: null };
}
