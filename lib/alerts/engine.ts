import type { Repo } from "@/lib/db/repo";
import type { Alert, Business, NewAlert } from "@/lib/db/types";
import { AD_COUNT_LOCAL_MAX } from "@/lib/intel/ingest";
import { tokens } from "@/lib/scoring";
import { businessStateGeo } from "@/lib/signals/geo";
import { weekOf } from "@/lib/recommend/recommend";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { sentenceCase } from "@/lib/text";

/**
 * The proactive half of the product: TRND notices, the owner doesn't have to
 * ask. Evaluated after every ingest run and on the week's page — every rule
 * is idempotent because alerts dedupe on a stable key, so re-evaluation is
 * always safe and never spams. Every alert lands somewhere that exists: the
 * week's tests or the rivals in Settings.
 */

const SPIKE_DELTA = 30;

export async function evaluateAlerts(repo: Repo, business: Business): Promise<Alert[]> {
  const week = weekOf();
  const created: Alert[] = [];
  const add = async (input: Omit<NewAlert, "business_id">) => {
    const row = await repo.createAlert({ ...input, business_id: business.id });
    if (row) created.push(row);
  };

  const [signals, brief, competitors, reads] = await Promise.all([
    repo.listSignalsForCategory(business.category, {
      sinceDays: 7,
      geo: businessStateGeo(business),
    }),
    repo.getBusinessBrief(business.id),
    repo.listCompetitors(business.id),
    repo.listCompetitorReads(business.id, { sinceDays: 14 }),
  ]);

  // ---- demand spike on a term this business actually cares about
  const anchors = tokens(
    [...(brief?.watch_terms ?? []), business.category].join(" "),
  );
  for (const s of signals) {
    if (typeof s.delta_pct !== "number" || s.delta_pct < SPIKE_DELTA) continue;
    if (s.metric_type === "news_coverage" || s.metric_type === "ad_saturation") continue;
    if (![...tokens(s.term)].some((t) => anchors.has(t))) continue;
    // Search volume is a monthly total, so its delta is month over month;
    // calling that "this week" claims a spike the source page contradicts.
    const window = s.source === "dataforseo" ? "over the last month" : "this week";
    await add({
      kind: "demand_spike",
      // Deltas clamp at 100 — "up 100%" really means doubled-or-more, and a
      // feed full of identical percentages reads as broken.
      title:
        s.delta_pct >= 100
          ? `"${sentenceCase(s.term)}" doubled or more ${window}`
          : `"${sentenceCase(s.term)}" is up ${Math.round(s.delta_pct)}% ${window}`,
      body: `It matches what you sell and is in this week's research.`,
      href: "/app/picks",
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
    // never alert on them.
    if (v.last > AD_COUNT_LOCAL_MAX || (v.prev !== null && v.prev > AD_COUNT_LOCAL_MAX)) continue;
    const isNew = v.prev === null && v.last > 0;
    const scaled = v.prev !== null && v.last > v.prev;
    if (!isNew && !scaled) continue;
    await add({
      kind: "competitor_ads",
      title: isNew
        ? `${competitor.name} is running ${v.last} active ad${v.last === 1 ? "" : "s"}`
        : `${competitor.name} scaled up: ${v.prev} → ${v.last} active ads`,
      body: `Their ads are read into this week's briefs as observed; what they say is under each test's evidence.`,
      href: "/app/settings",
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
      href: "/app/picks",
      dedupe_key: `seasonal:${m.label}:${new Date().getUTCFullYear()}`,
    });
  }

  return created;
}

/** The weekly "your tests are written" alert — fired by the Monday cron. */
export async function createWeekReadyAlert(repo: Repo, business: Business, count: number): Promise<Alert | null> {
  const week = weekOf();
  return repo.createAlert({
    business_id: business.id,
    kind: "report_ready",
    title: count === 1 ? "This week's creative test is written" : `This week's ${count} creative tests are written`,
    body: "Each one is a hypothesis with the evidence behind it and a brief you can hand to a creator.",
    href: "/app/picks",
    dedupe_key: `report:${week}`,
  });
}
