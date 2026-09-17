import { currentAiContext } from "@/lib/ai/usage";
import type { NewProviderUsage, ProviderUsage } from "@/lib/db/types";

/**
 * The meter on every paid call outside the model: which provider, how many
 * units, and what that is estimated to cost, by brand and by the job that
 * made it (the same async context the model meter uses).
 *
 * The product has no billed figures from any provider, so every cent here
 * is an estimate from a public rate, and the row says so (basis:
 * "estimate", with the rate in the note). A real invoice replaces the
 * estimate when one exists; until then the number is for seeing where the
 * money goes, not for accounting. Writing never throws and never waits.
 */

export type Provider = ProviderUsage["provider"];

/** Public rates the estimates use, in cents per unit, as read on the
 * providers' price pages in September 2026. Change here, nowhere else. */
export const RATES: Record<string, { centsPerUnit: number; unit: string; basis: string }> = {
  "apify:result": { centsPerUnit: 0.4, unit: "results", basis: "Apify pay-per-result actors bill $2 to $5 per 1,000 results; $4 per 1,000 assumed" },
  /** The Transparency Center actor's own price page (verified 2026-09-14). */
  "apify:result:google_ads": { centsPerUnit: 0.15, unit: "results", basis: "Apify ads-transparency-scraper bills $1.50 per 1,000 results" },
  "apify:run": { centsPerUnit: 2, unit: "runs", basis: "Apify compute for a run that returned nothing, about $0.02 assumed" },
  "dataforseo:keyword": { centsPerUnit: 0.005, unit: "keywords", basis: "DataForSEO search volume, about $0.05 per 1,000 keywords" },
  "dataforseo:related_task": { centsPerUnit: 1, unit: "tasks", basis: "DataForSEO keywords-for-keywords, about $0.01 per task" },
  "dataforseo:trends_task": { centsPerUnit: 0.3, unit: "tasks", basis: "DataForSEO Google Trends explore, about $0.003 per task" },
  "youtube:unit": { centsPerUnit: 0, unit: "quota units", basis: "YouTube Data API free tier, 10,000 units a day" },
  "places:call": { centsPerUnit: 0, unit: "calls", basis: "Places API (New) inside the monthly free tier" },
  "reddit:call": { centsPerUnit: 0, unit: "calls", basis: "Reddit API free tier" },
};

export function estimateCents(rateKey: string, units: number): number | null {
  const rate = RATES[rateKey];
  if (!rate) return null;
  return Math.round(rate.centsPerUnit * units * 100) / 100;
}

type Sink = (row: NewProviderUsage) => Promise<void>;
let sink: Sink | null = null;

/** Tests swap the writer; production writes through the admin repo. */
export function setProviderUsageSink(fn: Sink | null): void {
  sink = fn;
}

/** Errors are recorded without secrets or addresses: the message's first line, cut short. */
export function cleanNote(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .split("\n")[0]
    .replace(/token=[^&\s]+/gi, "token=…")
    .replace(/https?:\/\/\S+/g, "(url)")
    .slice(0, 200);
}

export interface ProviderCall {
  provider: Provider;
  /** The actor, endpoint or adapter that was called. */
  operation: string;
  /** The rate to estimate with, one of RATES; omit for a free provider. */
  rateKey?: string;
  units: number;
  ok?: boolean;
  note?: string | null;
  businessId?: string | null;
  purpose?: string;
}

/** Record one call against the current job context. Fire and forget. */
export function recordProviderUsage(call: ProviderCall): void {
  const ctx = currentAiContext();
  const rate = call.rateKey ? RATES[call.rateKey] : undefined;
  const row: NewProviderUsage = {
    business_id: call.businessId ?? ctx?.businessId ?? null,
    provider: call.provider,
    operation: call.operation.slice(0, 120),
    units: Math.max(0, call.units),
    unit_label: rate?.unit ?? "calls",
    est_cost_cents: call.rateKey ? estimateCents(call.rateKey, Math.max(0, call.units)) : null,
    basis: "estimate",
    purpose: call.purpose ?? ctx?.purpose ?? "unknown",
    ok: call.ok ?? true,
    note: cleanNote(call.note ?? (rate ? rate.basis : null)),
  };
  const write =
    sink ??
    (async (r: NewProviderUsage) => {
      const { getAdminRepo } = await import("@/lib/db/admin");
      await getAdminRepo().recordProviderUsage(r);
    });
  write(row).catch((err) => console.warn("[usage] provider usage not recorded (non-fatal):", (err as Error).message));
}

export interface ProviderSummary {
  calls: number;
  failed: number;
  /** Estimated cents, summed over rows that had a rate. */
  estCostCents: number;
  byProvider: Record<string, { calls: number; units: number; estCostCents: number; failed: number }>;
  byPurpose: Record<string, { calls: number; estCostCents: number }>;
  basis: "estimate";
}

export function summarizeProviderUsage(rows: ProviderUsage[]): ProviderSummary {
  const out: ProviderSummary = { calls: 0, failed: 0, estCostCents: 0, byProvider: {}, byPurpose: {}, basis: "estimate" };
  for (const r of rows) {
    out.calls += 1;
    if (!r.ok) out.failed += 1;
    const cents = Number(r.est_cost_cents ?? 0) || 0;
    out.estCostCents += cents;
    const p = (out.byProvider[r.provider] ??= { calls: 0, units: 0, estCostCents: 0, failed: 0 });
    p.calls += 1;
    p.units += Number(r.units) || 0;
    p.estCostCents += cents;
    if (!r.ok) p.failed += 1;
    const j = (out.byPurpose[r.purpose] ??= { calls: 0, estCostCents: 0 });
    j.calls += 1;
    j.estCostCents += cents;
  }
  out.estCostCents = Math.round(out.estCostCents * 100) / 100;
  for (const p of Object.values(out.byProvider)) p.estCostCents = Math.round(p.estCostCents * 100) / 100;
  for (const j of Object.values(out.byPurpose)) j.estCostCents = Math.round(j.estCostCents * 100) / 100;
  return out;
}
