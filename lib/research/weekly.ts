import type { Repo } from "@/lib/db/repo";
import type { Business } from "@/lib/db/types";
import { weekOf } from "@/lib/recommend/week";

import { buildDossier, renderDossier, type Dossier, type DossierCoverage } from "./dossier";
import { defaultStrategist, StrategyReadSchema, STRATEGIST_VERSION, type StrategistWriter, type StrategyRead } from "./strategist";

/**
 * The week's account read, made once and shared: the dossier is built from
 * what is stored, the strategist reads it, and the read is kept on the
 * week so every brief written that week starts from the same situation
 * and the page can show it. A read is made again only when the reads
 * behind it grew: a fresh signup is graded before its rivals' ads land,
 * and the first read must not outlive that.
 */

export interface WeekStrategy {
  read: StrategyRead;
  dossier: Dossier;
  /** True when this call made a new read rather than serving the stored one. */
  fresh: boolean;
  model: string;
}

/** Whether what was read since the stored read would change it. */
export function readIsStale(stored: Partial<DossierCoverage> | null | undefined, now: DossierCoverage): boolean {
  if (!stored) return true;
  const grew = (a: number | undefined, b: number, by = 1) => (b - (a ?? 0)) >= by;
  if (grew(stored.rivalsWithAdsRead, now.rivalsWithAdsRead)) return true;
  if (grew(stored.rivalAdsStored, now.rivalAdsStored, Math.max(5, Math.ceil((stored.rivalAdsStored ?? 0) * 0.5)))) return true;
  if ((stored.ownPosts ?? 0) === 0 && now.ownPosts > 0) return true;
  if (grew(stored.rivalPosts, now.rivalPosts, Math.max(20, Math.ceil((stored.rivalPosts ?? 0) * 0.5)))) return true;
  if ((stored.ownAdRows ?? 0) === 0 && now.ownAdRows > 0) return true;
  if ((stored.comments ?? 0) + (stored.reviews ?? 0) === 0 && now.comments + now.reviews > 0) return true;
  if (grew(stored.termsWithVolume, now.termsWithVolume, 10)) return true;
  return false;
}

export async function ensureWeekStrategy(
  repo: Repo,
  business: Business,
  opts: { weekOf?: string; strategist?: StrategistWriter | null; now?: Date } = {},
): Promise<WeekStrategy | null> {
  const week = opts.weekOf ?? weekOf(opts.now);
  const strategist = opts.strategist === undefined ? defaultStrategist() : opts.strategist;
  const dossier = await buildDossier(repo, business, { now: opts.now });
  const stored = await repo.getStrategyRead(business.id, week).catch(() => null);
  if (stored) {
    const parsed = StrategyReadSchema.safeParse(stored.read);
    if (parsed.success && !readIsStale(stored.coverage as Partial<DossierCoverage> | null, dossier.coverage)) {
      return { read: parsed.data, dossier, fresh: false, model: stored.model_used };
    }
  }
  if (!strategist) return null;
  const { value, model } = await strategist(dossier);
  await repo
    .upsertStrategyRead({
      business_id: business.id,
      week_of: week,
      read: value,
      coverage: dossier.coverage,
      dossier_chars: renderDossier(dossier).length,
      model_used: model,
      prompt_version: STRATEGIST_VERSION,
    })
    .catch((err: Error) => console.warn(`[strategy] ${business.id} not stored (non-fatal):`, err.message));
  return { read: value, dossier, fresh: true, model };
}

/** The stored read alone, for a page: no dossier build, no model call. */
export async function storedWeekStrategy(repo: Repo, businessId: string, week = weekOf()): Promise<StrategyRead | null> {
  const stored = await repo.getStrategyRead(businessId, week).catch(() => null);
  if (!stored) return null;
  const parsed = StrategyReadSchema.safeParse(stored.read);
  return parsed.success ? parsed.data : null;
}
