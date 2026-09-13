import type { Repo } from "@/lib/db/repo";
import type { Business, Opportunity, Signal } from "@/lib/db/types";
import { sentenceCase } from "@/lib/text";

import { gradeFor } from "./grade";
import { previousWeek, weekOf } from "./week";

/**
 * What TRND remembers about this business — the part that makes week six
 * different from week one. Every week's ranking, every campaign and what
 * it returned, every pass, every rival move, folded into lines a model can
 * write from ("third week in a row ranked", "you passed on this two weeks
 * ago", "the last ad on this returned 2.5% clicks"). Read from the tables
 * that already exist; nothing here is a new write.
 */
export interface BusinessHistory {
  /** How many weeks back were read. */
  weeks: number;
  /** Weeks that actually held a ranking. */
  weeksRanked: number;
  /** One line per remembered thing, for a FACTS block. */
  lines: string[];
  /** The one line about a term, keyed by normalized term — for a pick's facts. */
  byTerm: Map<string, string>;
}

const fmt = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function buildBusinessHistory(
  repo: Repo,
  business: Business,
  weeks = 6,
): Promise<BusinessHistory> {
  const thisWeek = weekOf();
  const weekKeys: string[] = [thisWeek];
  for (let i = 1; i < weeks; i++) weekKeys.push(previousWeek(weekKeys[i - 1]));

  const signalCache = new Map<string, Signal | null>();
  const signalFor = async (id: string) => {
    if (!signalCache.has(id)) signalCache.set(id, await repo.getSignal(id));
    return signalCache.get(id) ?? null;
  };

  // ---- rankings, week by week
  type Seen = { week: string; weeksAgo: number; rank: number; opportunity: Opportunity };
  const perTerm = new Map<string, { term: string; seen: Seen[] }>();
  let weeksRanked = 0;
  for (let i = 0; i < weekKeys.length; i++) {
    const rows = (await repo.listOpportunities(business.id, weekKeys[i])).sort((a, b) => Number(b.score) - Number(a.score));
    if (rows.length === 0) continue;
    weeksRanked++;
    let rank = 0;
    for (const o of rows) {
      const s = await signalFor(o.signal_id);
      if (!s) continue;
      if (o.status !== "dismissed") rank++;
      const entry = perTerm.get(s.normalized_term) ?? { term: s.term, seen: [] };
      entry.seen.push({ week: weekKeys[i], weeksAgo: i, rank: o.status === "dismissed" ? 0 : rank, opportunity: o });
      perTerm.set(s.normalized_term, entry);
    }
  }

  // ---- campaigns and what they returned
  const [campaigns, results] = await Promise.all([
    repo.listCampaigns(business.id),
    repo.listResultsForBusiness(business.id),
  ]);
  const resultsByCampaign = new Map<string, typeof results>();
  for (const r of results) resultsByCampaign.set(r.campaign_id, [...(resultsByCampaign.get(r.campaign_id) ?? []), r]);
  const campaignByOpportunity = new Map(campaigns.map((c) => [c.opportunity_id, c]));

  const lines: string[] = [];
  const byTerm = new Map<string, string>();
  const ago = (n: number) => (n === 0 ? "this week" : n === 1 ? "last week" : `${n} weeks ago`);

  for (const [key, { term, seen }] of perTerm) {
    const ranked = seen.filter((x) => x.rank > 0);
    const passed = seen.filter((x) => x.opportunity.status === "dismissed");
    const bits: string[] = [];
    if (ranked.length > 0) {
      const best = ranked.reduce((a, b) => (a.rank < b.rank ? a : b));
      const latest = ranked[0];
      bits.push(
        ranked.length === 1
          ? `ranked #${latest.rank} (${gradeFor(Number(latest.opportunity.score)).letter}) ${ago(latest.weeksAgo)}`
          : `ranked ${ranked.length} of the last ${weeksRanked} weeks (best #${best.rank}, ${gradeFor(Number(best.opportunity.score)).letter}; ${ago(latest.weeksAgo)} #${latest.rank})`,
      );
    }
    if (passed.length > 0) bits.push(`you passed on it ${ago(passed[0].weeksAgo)}`);
    const built = seen.map((x) => campaignByCampaignOpportunity(campaignByOpportunity, x.opportunity.id)).find(Boolean);
    if (built) {
      const rs = resultsByCampaign.get(built.id) ?? [];
      const latest = rs[0];
      bits.push(
        latest
          ? `the ad on it (${fmt(built.created_at)}) returned ${latest.ctr !== null ? `${(Number(latest.ctr) * 100).toFixed(2)}% clicks` : "results"}${latest.bookings !== null ? `, ${latest.bookings} booking${latest.bookings === 1 ? "" : "s"}` : ""}${latest.spend_cents !== null ? ` on $${Math.round(latest.spend_cents / 100)}` : ""}`
          : built.status === "live"
            ? `an ad on it is live since ${fmt(built.created_at)} — no results recorded yet`
            : `an ad on it was written ${fmt(built.created_at)} and hasn't launched`,
      );
    }
    if (bits.length === 0) continue;
    const line = `"${sentenceCase(term)}": ${bits.join("; ")}.`;
    byTerm.set(key, line);
    lines.push(line);
  }

  // ---- rivals over the window
  const competitors = await repo.listCompetitors(business.id);
  if (competitors.length > 0) {
    const reads = await repo.listCompetitorReads(business.id, { sinceDays: weeks * 7 });
    for (const c of competitors) {
      const ads = reads
        .filter((r) => r.competitor_id === c.id && r.kind === "ads" && typeof r.value === "number")
        .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
      if (ads.length >= 2) {
        const first = ads[0];
        const last = ads[ads.length - 1];
        if (first.value !== last.value) {
          lines.push(`Rival ${c.name}: ${first.value} → ${last.value} active Meta ads between ${fmt(first.captured_at)} and ${fmt(last.captured_at)}.`);
        }
      }
    }
  }

  // ---- the whole record, in one line
  const launched = campaigns.filter((c) => c.status === "live" || c.status === "complete").length;
  if (weeksRanked > 0) {
    lines.unshift(
      `Memory: ${weeksRanked} week${weeksRanked === 1 ? "" : "s"} of rankings on file, ${campaigns.length} ad${campaigns.length === 1 ? "" : "s"} written, ${launched} launched, ${results.length} result${results.length === 1 ? "" : "s"} recorded.`,
    );
  }
  return { weeks, weeksRanked, lines, byTerm };
}

function campaignByCampaignOpportunity<T>(map: Map<string, T>, opportunityId: string): T | undefined {
  return map.get(opportunityId);
}
