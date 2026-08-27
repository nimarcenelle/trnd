import type { Repo } from "@/lib/db/repo";
import type { Alert, Business, NewAlert } from "@/lib/db/types";
import { AD_COUNT_LOCAL_MAX } from "@/lib/intel/ingest";
import { tokens } from "@/lib/scoring";
import { weekOf } from "@/lib/recommend/recommend";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { benchmarkFor } from "@/lib/results/benchmarks";
import { titleCase } from "@/lib/text";

/**
 * The proactive half of the product: TRND notices, the owner doesn't have to
 * ask. Evaluated after every ingest/recommend run and on dashboard loads —
 * every rule is idempotent because alerts dedupe on a stable key, so
 * re-evaluation is always safe and never spams.
 */

const SPIKE_DELTA = 30;
const UNDERPERFORM_RATIO = 0.6;

export async function evaluateAlerts(repo: Repo, business: Business): Promise<Alert[]> {
  const week = weekOf();
  const created: Alert[] = [];
  const add = async (input: Omit<NewAlert, "business_id">) => {
    const row = await repo.createAlert({ ...input, business_id: business.id });
    if (row) created.push(row);
  };

  const [signals, brief, competitors, reads, campaigns, results] = await Promise.all([
    repo.listSignalsForCategory(business.category, {
      sinceDays: 7,
      geo: business.region ? `US-${business.region.toUpperCase()}` : undefined,
    }),
    repo.getBusinessBrief(business.id),
    repo.listCompetitors(business.id),
    repo.listCompetitorReads(business.id, { sinceDays: 14 }),
    repo.listCampaigns(business.id),
    repo.listResultsForBusiness(business.id),
  ]);

  // ---- demand spike on a term this business actually cares about
  const anchors = tokens(
    [...(brief?.watch_terms ?? []), business.category].join(" "),
  );
  for (const s of signals) {
    if (typeof s.delta_pct !== "number" || s.delta_pct < SPIKE_DELTA) continue;
    if (s.metric_type === "news_coverage" || s.metric_type === "ad_saturation") continue;
    if (![...tokens(s.term)].some((t) => anchors.has(t))) continue;
    await add({
      kind: "demand_spike",
      title: `"${titleCase(s.term)}" is up ${Math.round(s.delta_pct)}% this week`,
      body: `Demand you can serve is moving — it's in this week's ranking with a full read.`,
      href: "/app",
      dedupe_key: `spike:${s.normalized_term}:${week}`,
    });
  }

  // ---- competitor started or scaled ads
  const byCompetitor = new Map(competitors.map((c) => [c.id, c]));
  const adReads = reads
    .filter((r) => r.kind === "ads" && typeof r.value === "number")
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const latestByCompetitor = new Map<string, { prev: number | null; last: number; day: string }>();
  for (const r of adReads) {
    const cur = latestByCompetitor.get(r.competitor_id);
    latestByCompetitor.set(r.competitor_id, {
      prev: cur ? cur.last : null,
      last: r.value as number,
      day: r.captured_at.slice(0, 10),
    });
  }
  for (const [competitorId, v] of latestByCompetitor) {
    const competitor = byCompetitor.get(competitorId);
    if (!competitor) continue;
    // Franchise-scale keyword totals are brand noise, not a local move —
    // never alert on them (the report still shows the labeled read).
    if (v.last > AD_COUNT_LOCAL_MAX || (v.prev !== null && v.prev > AD_COUNT_LOCAL_MAX)) continue;
    const isNew = v.prev === null && v.last > 0;
    const scaled = v.prev !== null && v.last > v.prev;
    if (!isNew && !scaled) continue;
    await add({
      kind: "competitor_ads",
      title: isNew
        ? `${competitor.name} is running ${v.last} active ad${v.last === 1 ? "" : "s"}`
        : `${competitor.name} scaled up: ${v.prev} → ${v.last} active ads`,
      body: `Their creative is in your intel report's competitor section.`,
      href: "/app/report",
      dedupe_key: `compads:${competitorId}:${v.last}:${v.day}`,
    });
  }

  // ---- a seasonal prep window just opened
  for (const m of upcomingMoments(business.category)) {
    if (!m.prepNow) continue;
    await add({
      kind: "seasonal_window",
      title: `Prep window open: ${m.label} (${m.daysOut} days out)`,
      body: m.advice,
      href: "/app/report",
      dedupe_key: `seasonal:${m.label}:${new Date().getUTCFullYear()}`,
    });
  }

  // ---- a live campaign is underperforming its category benchmark
  const benchmark = benchmarkFor(business.category);
  const latestResultByCampaign = new Map<string, number>();
  for (const r of results) {
    if (r.ctr === null || latestResultByCampaign.has(r.campaign_id)) continue;
    latestResultByCampaign.set(r.campaign_id, Number(r.ctr));
  }
  for (const c of campaigns.filter((x) => x.status === "live")) {
    const ctr = latestResultByCampaign.get(c.id);
    if (ctr === undefined || ctr >= benchmark * UNDERPERFORM_RATIO) continue;
    await add({
      kind: "campaign_performance",
      title: `"${c.hook.slice(0, 60)}" is trailing benchmark`,
      body: `CTR ${(ctr * 100).toFixed(2)}% vs ~${(benchmark * 100).toFixed(1)}% category typical — swap in the next headline variant before adding spend.`,
      href: `/app/campaigns/${c.id}`,
      dedupe_key: `perf:${c.id}:${week}`,
    });
  }

  return created;
}

/** The weekly "your report is ready" alert — fired by the Monday cron. */
export async function createReportReadyAlert(repo: Repo, business: Business): Promise<Alert | null> {
  const week = weekOf();
  return repo.createAlert({
    business_id: business.id,
    kind: "report_ready",
    title: "Your weekly intel report is ready",
    body: "This week's verdict, ranking, demand tracker, and competitor moves — with sources.",
    href: "/app/report",
    dedupe_key: `report:${week}`,
  });
}
