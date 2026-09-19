import type { Repo } from "@/lib/db/repo";
import { readAdHistory } from "@/lib/ads/history-read";
import { benchmarkFor } from "@/lib/results/benchmarks";

import { buildTrackRecord, type FidelityRecord } from "./track";

/**
 * The public record: every test every brand ran, de-identified and summed.
 * Nobody else in the category shows a hit rate. This page does, at
 * whatever number it is, with the same rules the private record uses: a
 * run is scored only when it ended with a verdict or with numbers, and a
 * test that followed its brief is counted apart from one that strayed.
 * No brand, product or term is named.
 */

export interface PublicRecord {
  brands: number;
  runs: number;
  scored: number;
  won: number;
  lost: number;
  open: number;
  hitRate: number | null;
  byFidelity: FidelityRecord;
  /** One point per scored run across every brand, in the order they ended. */
  series: { day: string; won: number; scored: number; rate: number }[];
  builtAt: string;
}

export async function buildPublicRecord(repo: Repo, now = new Date()): Promise<PublicRecord> {
  const out: PublicRecord = {
    brands: 0,
    runs: 0,
    scored: 0,
    won: 0,
    lost: 0,
    open: 0,
    hitRate: null,
    byFidelity: { followed: { runs: 0, scored: 0, won: 0 }, strayed: { runs: 0, scored: 0, won: 0 }, unchecked: 0 },
    series: [],
    builtAt: now.toISOString(),
  };
  const ended: { day: string; won: boolean }[] = [];
  let businesses: Awaited<ReturnType<Repo["listAllBusinesses"]>> = [];
  try {
    businesses = await repo.listAllBusinesses();
  } catch (err) {
    console.warn("[record:public] listing brands failed:", (err as Error).message);
    return out;
  }
  for (const business of businesses) {
    try {
      const [runs, history] = await Promise.all([repo.listPickRuns(business.id), repo.listAdHistory(business.id).catch(() => [])]);
      if (runs.length === 0) continue;
      const record = buildTrackRecord(runs, { accountCtr: readAdHistory(history).accountCtr, benchmarkCtr: benchmarkFor(business.category) });
      out.brands += 1;
      out.runs += record.runs;
      out.scored += record.scored;
      out.won += record.won;
      out.lost += record.lost;
      out.open += record.open;
      for (const side of ["followed", "strayed"] as const) {
        out.byFidelity[side].runs += record.byFidelity[side].runs;
        out.byFidelity[side].scored += record.byFidelity[side].scored;
        out.byFidelity[side].won += record.byFidelity[side].won;
      }
      out.byFidelity.unchecked += record.byFidelity.unchecked;
      for (const r of record.rows) if ((r.outcome === "won" || r.outcome === "lost") && r.endedAt) ended.push({ day: r.endedAt.slice(0, 10), won: r.outcome === "won" });
    } catch (err) {
      console.warn(`[record:public] ${business.id} skipped:`, (err as Error).message);
    }
  }
  ended.sort((a, b) => a.day.localeCompare(b.day));
  let w = 0;
  let s = 0;
  for (const e of ended) {
    s += 1;
    if (e.won) w += 1;
    out.series.push({ day: e.day, won: w, scored: s, rate: w / s });
  }
  out.hitRate = out.scored > 0 ? out.won / out.scored : null;
  return out;
}
