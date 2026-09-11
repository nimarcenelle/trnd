import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AdPreview from "@/components/app/ad-preview";
import AnalysisProgress from "@/components/app/analysis-progress";
import AutoRefresh from "@/components/app/auto-refresh";
import ScoreBreakdown from "@/components/app/score-breakdown";
import GradePill from "@/components/app/grade-pill";
import GradeRing from "@/components/app/grade-ring";
import SubmitButton from "@/components/app/submit-button";
import DeltaChip from "@/components/app/delta-chip";
import SourceBadge from "@/components/app/source-badge";
import TrendChart from "@/components/app/trend-chart";
import InsightList from "@/components/app/insight-list";
import PickAsk from "@/components/app/pick-ask";
import StandingQuestions from "@/components/app/standing-questions";
import { getSessionUser } from "@/lib/auth/session";
import BuildCampaignButton from "@/components/app/build-campaign-button";
import { markAlertsReadAction } from "@/lib/intel/actions";
import { suggestStandingQuestions } from "@/lib/intel/standing";
import { passOnPickAction, refreshRankingAction, scanMarketNowAction } from "@/lib/recommend/actions";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import type { Signal } from "@/lib/db/types";
import { ensureWeekCampaign, shouldAutoBuild } from "@/lib/campaigns/auto";
import { campaignRebuildable } from "@/lib/campaigns/build";
import { explainOpportunity } from "@/lib/recommend/explain";
import { buildPickFacts } from "@/lib/recommend/pick-facts";
import { ensurePickRead, readIsCurrent } from "@/lib/recommend/read";
import CopyBlock from "@/components/app/copy-block";
import { buildHowTo, tiktokHashtag } from "@/lib/recommend/howto";
import { buildOrganicPost } from "@/lib/recommend/post";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { budgetFor, buildInsights, buildNextAction, launchByFor } from "@/lib/recommend/insights";
import { AD_COUNT_LOCAL_MAX } from "@/lib/scoring";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { previousWeek, rankingChanges, rivalChanges } from "@/lib/recommend/diff";
import { forecastFlight, forecastLine } from "@/lib/recommend/forecast";
import { getPlanState } from "@/lib/billing";
import { seedCompetitorsAction } from "@/lib/intel/actions";
import { BRIEF_FALLBACK_MODEL, BRIEF_PROMPT_VERSION, briefLikelyInFlight, businessJustOnboarded, generateBusinessBrief } from "@/lib/ai/brief";
import { isGeminiConfigured, isPlacesConfigured, isSupabaseConfigured } from "@/lib/env";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";
import { geoLabel } from "@/lib/signals/geo";
import { deltaWindowLabel, sourceUrl } from "@/lib/signals/source-url";
import { sentenceCase, titleCase } from "@/lib/text";

export const metadata = { title: "This week — TRND" };

function fmtDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

// Source deltas clamp at ±100, so "↑100%" really means "doubled or more" —
// and a column of five identical ↑100% chips reads as a bug, not a signal.
// "↑0%" and "↑-12%" read as bugs too: flat is "steady", down gets its arrow.
function deltaShort(d: number) {
  if (Math.abs(d) < 1) return "steady";
  if (d >= 100) return "2×+";
  return d > 0 ? `↑${Math.round(d)}%` : `↓${Math.abs(Math.round(d))}%`;
}

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string | string[] }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  let opportunities = await repo.listOpportunities(business.id, week);
  if (opportunities.length === 0) {
    // First visit of the week: pull this business's market reads if none
    // exist yet, then score what we have right now so the screen is never
    // empty. The weekly cron does the same in bulk. Ranking writes to shared
    // tables (signals, opportunities) that RLS keeps read-only for user
    // sessions, so the job runs on the service repo — and a failed rank
    // degrades to the empty state, never the error boundary.
    try {
      const { ensureIntelFresh } = await import("@/lib/intel/ingest");
      await ensureIntelFresh(getAdminRepo(), business);
    } catch (err) {
      console.warn("[app] first-visit intel refresh failed (non-fatal):", (err as Error).message);
    }
    try {
      await recommendForBusiness(getAdminRepo(), business);
      opportunities = await repo.listOpportunities(business.id, week);
    } catch (err) {
      console.warn("[app] first-visit ranking failed (non-fatal):", (err as Error).message);
    }
  }

  const active = opportunities.filter((o) => o.status !== "dismissed");
  // The hero shows one of the week's top picks — #1 by default, any of the
  // first five via ?pick=n so the owner can page through them in full.
  const picks = active.slice(0, 5);
  const pickParam = (await searchParams).pick;
  const requested = Number.parseInt(Array.isArray(pickParam) ? (pickParam[0] ?? "") : (pickParam ?? ""), 10);
  const pickIndex = Number.isFinite(requested) && requested >= 1 && requested <= picks.length ? requested - 1 : 0;
  const lead = active[0] ?? null;
  const top = picks[pickIndex] ?? null;
  const isLead = pickIndex === 0;

  const weekEnd = new Date(new Date(`${week}T00:00:00Z`).getTime() + 6 * 86400_000);
  const weekRange = `${fmtDate(week)} – ${fmtDate(weekEnd)}`;

  const [categorySignals, campaigns, results, learnings, unreadAlerts] = await Promise.all([
    repo.listSignalsForCategory(business.category, { sinceDays: 7 }),
    repo.listCampaigns(business.id),
    repo.listResultsForBusiness(business.id),
    repo.listLearnings(business.category),
    repo.listAlerts(business.id, { unreadOnly: true, limit: 5 }),
  ]);
  const watched = categorySignals.filter(
    (s) => s.metric_type !== "news_coverage" && s.metric_type !== "ad_saturation",
  );
  const launched = campaigns.filter((c) => c.status === "live" || c.status === "complete");
  const ctrs = results.map((r) => r.ctr).filter((v): v is number => typeof v === "number");
  const avgCtr = ctrs.length ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null;
  // The ledger: what TRND campaigns did, in dollars. Only rendered once real
  // spend exists — a zero ledger is noise, not proof.
  const sumR = (f: (r: (typeof results)[number]) => number | null) =>
    results.reduce((acc, r) => acc + (f(r) ?? 0), 0);
  const ledger = {
    spendCents: sumR((r) => r.spend_cents),
    revenueCents: sumR((r) => r.revenue_cents),
    bookings: sumR((r) => r.bookings),
    synced: results.some((r) => r.source === "meta_api"),
  };

  // Re-evaluate proactive alerts after the response — idempotent (deduped
  // keys), so the dashboard doubles as the alert heartbeat between crons.
  after(async () => {
    try {
      const { evaluateAlerts } = await import("@/lib/alerts/engine");
      await evaluateAlerts(repo, business);
    } catch (err) {
      console.warn("[app] alert evaluation failed (non-fatal):", (err as Error).message);
    }
  });

  if (!top) {
    // A missing analysis means the ranking is deliberately held (never show
    // unjudged junk) — narrate the wait and refresh into the real picks.
    const pendingBrief = await repo.getBusinessBrief(business.id);
    if (!pendingBrief && isGeminiConfigured) {
      if (!briefLikelyInFlight(business.created_at)) {
        // The background write died somewhere — self-heal.
        after(async () => {
          try {
            await repo.upsertBusinessBrief(
              await generateBusinessBrief(business, await repo.listServices(business.id)),
            );
            const { rerankWeek } = await import("@/lib/recommend/rerank");
            await rerankWeek(getAdminRepo(), business);
          } catch (err) {
            console.warn("[app] brief recovery failed (non-fatal):", (err as Error).message);
          }
        });
      }
      return (
        <div className="page">
          <AutoRefresh everyMs={8000} />
          <div className="page-head">
            <div>
              <span className="eyebrow" style={{ margin: 0 }}>This week · {weekRange}</span>
              <h1>Reading your business</h1>
              <p className="context">
                Your analysis is being written. Your first ranking lands with it, usually within
                two minutes. This page refreshes itself.
              </p>
            </div>
          </div>
          <div className="panel" style={{ maxWidth: 620 }}>
            <AnalysisProgress startedAt={business.created_at} />
            <Link className="btn btn-ghost btn-sm" href="/app/snapshot" style={{ marginTop: 18 }}>
              View the analysis
            </Link>
          </div>
        </div>
      );
    }
    // The product's job is to hand them an analysis — scan automatically
    // instead of asking. Guarded so it can't loop-spend on adapters: only a
    // freshly onboarded business (the case where onboarding's own scan
    // hiccuped), and only when today holds no reads for this identity yet.
    const scannedToday =
      (await repo.listSignalsForCategory(business.category, { sinceDays: 1 })).length > 0;
    const freshBusiness = businessJustOnboarded(business.created_at);
    if (pendingBrief && isSupabaseConfigured && freshBusiness && !scannedToday) {
      after(async () => {
        try {
          const jobRepo = getAdminRepo();
          const { runSignalIngestForBusiness } = await import("@/lib/signals/ingest");
          await runSignalIngestForBusiness(jobRepo, business);
          const { rerankWeek } = await import("@/lib/recommend/rerank");
          await rerankWeek(jobRepo, business);
        } catch (err) {
          console.warn("[app] auto market scan failed (non-fatal):", (err as Error).message);
        }
      });
      return (
        <div className="page">
          <AutoRefresh everyMs={8000} />
          <div className="page-head">
            <div>
              <span className="eyebrow" style={{ margin: 0 }}>This week · {weekRange}</span>
              <h1>Reading your market</h1>
              <p className="context">
                Reading demand for <b>{business.category}</b> around {business.city}, then ranking
                it against what you sell.
              </p>
            </div>
          </div>
          <div className="panel" style={{ maxWidth: 620 }}>
            <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.65, fontSize: 14.5 }}>
              This takes a minute or two. The page refreshes itself.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <span className="eyebrow" style={{ margin: 0 }}>This week · {weekRange}</span>
            <h1>No recommendation this week</h1>
            <p className="context">
              This week&apos;s reads for <b>{titleCase(business.category)}</b> around {business.city} didn&apos;t
              produce a pick worth spending on.
            </p>
          </div>
        </div>
        <div className="panel" style={{ maxWidth: 620 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.65, fontSize: 14.5 }}>
            The daily read continues. You can refresh it now.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
            <form action={scanMarketNowAction}>
              <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Refreshing…">
                Refresh now
              </SubmitButton>
            </form>
            <Link className="btn btn-ghost btn-sm" href="/app/report">
              Weekly report
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/app/opportunities">
              Dismissed picks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [signal, campaign, services] = await Promise.all([
    repo.getSignal(top.signal_id),
    repo.getCampaignByOpportunity(top.id),
    repo.listServices(business.id),
  ]);
  const matchedService = services.find((s) => s.id === top.matched_service_id) ?? null;
  // Judged-thin week: even the pool's best sits below the worth-running bar.
  // The screen must not dress it up — no creative playbook, no "capture this
  // demand" pitch — just the honest read and what to run instead.
  const thin = Number(top.score) < 4.3;
  // The week is thin when even #1 sits below the bar — that drives the
  // "run your own moves" section regardless of which pick is being viewed.
  const weekThin = lead ? Number(lead.score) < 4.3 : thin;
  const snapshotReason = top.rationale?.match(/Snapshot read: (.+)$/)?.[1] ?? null;
  const howto =
    signal && !thin
      ? buildHowTo({
          term: tiktokHashtag(signal) ?? signal.term,
          category: business.category,
          city: business.city,
          source: signal.source,
          serviceName: matchedService?.name ?? null,
        })
      : null;

  // The Ad Library read for this term, when the daily scan captured one —
  // real saturation plus what competitors are actually running.
  const adRead = signal
    ? (categorySignals.find(
        (s) =>
          s.metric_type === "ad_saturation" &&
          (s.normalized_term === signal.normalized_term ||
            s.normalized_term.startsWith(`${signal.normalized_term}_`)),
      ) ?? null)
    : null;
  // Only ads that actually speak to the term — the Ad Library is a keyword
  // search, and a motorcycle dealer's "tune-up" ad is not this shop's rival.
  const adAssessment = adRead
    ? assessAdRead(
        (adRead.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads,
        adRead.term,
        [business.city, business.region ?? ""].filter(Boolean),
        adRead.value as number,
      )
    : null;
  const competitorAds = (adAssessment?.ads ?? []).slice(0, 2);
  const series = signal ? await repo.getSeries(signal.normalized_term, signal.geo, 30) : [];
  // The interest read for this term (may live on a sibling google_trends row).
  const interestSparse = signal
    ? categorySignals.some(
        (s) =>
          s.normalized_term === signal.normalized_term &&
          s.metric_type === "search_interest" &&
          (s.raw as { sparse?: boolean } | null)?.sparse === true,
      )
    : false;
  const explained = signal ? await explainOpportunity(repo, business, top, signal) : null;
  // The zero-budget move: every non-thin week hands the owner a free,
  // ready-to-paste post built from the pick + their customers' own words.
  const voiceDigest = await repo.getReviewDigest(business.id);
  const organicPost =
    howto && signal
      ? buildOrganicPost({
          term: signal.term,
          businessName: business.name,
          hook: campaign?.hook ?? null,
          copyHooks: voiceDigest?.copy_hooks ?? [],
          hashtags: howto.hashtags,
        })
      : null;

  const insights =
    signal && explained
      ? buildInsights(signal, explained, {
          learnings,
          unfit: thin && !matchedService,
          snapshotReason,
        })
      : [];
  // The read on this pick — the analyst's paragraphs over the same facts the
  // meters show. Model-written and cached per pick; when its facts moved (a
  // re-rank, a new match) it's rewritten after the response and lands on the
  // next load. Keyless installs keep the deterministic insight lines alone.
  const pickFacts = signal ? await buildPickFacts(repo, business, top, signal) : null;
  const storedRead = await repo.getPickRead(top.id);
  const read = pickFacts && readIsCurrent(storedRead, pickFacts) ? storedRead : null;
  const readInFlight = Boolean(pickFacts && !read && isGeminiConfigured);
  if (readInFlight && pickFacts) {
    after(async () => {
      try {
        await ensurePickRead(repo, business, top, { signal, facts: pickFacts });
      } catch (err) {
        console.warn("[app] pick read failed (non-fatal):", (err as Error).message);
      }
    });
  }
  const askQuestions = read?.questions ?? pickFacts?.questions ?? [];

  const launchBy = fmtDate(launchByFor(week));
  const nextAction = buildNextAction({
    hasCampaign: Boolean(campaign),
    launchBy,
    priceBand: business.price_band,
    term: signal?.term,
    serviceName: matchedService?.name ?? null,
    servicePrice:
      matchedService?.price_cents != null ? `$${Math.round(matchedService.price_cents / 100)}` : null,
  });

  // The other picks + their signals: hero tabs and the strip below the hero.
  const pickSignals = new Map<string, Signal | null>(
    await Promise.all(
      picks.map(async (o) => [o.id, o.id === top.id ? signal : await repo.getSignal(o.signal_id)] as const),
    ),
  );
  const runnerUps = picks.filter((o) => o.id !== top.id);
  const runnerSignals = pickSignals;
  const runnerExplained = new Map(
    await Promise.all(
      runnerUps.map(async (o) => {
        const s = runnerSignals.get(o.id);
        return [o.id, s ? await explainOpportunity(repo, business, o, s) : null] as const;
      }),
    ),
  );

  // Market pulse: this week's top movers in the category — one row per term
  // (the same term arrives on several metrics/geos and must not list twice).
  const moverSeen = new Set<string>();
  const movers = [...watched]
    .filter((s) => typeof s.delta_pct === "number")
    .sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))
    .filter((s) => (moverSeen.has(s.normalized_term) ? false : (moverSeen.add(s.normalized_term), true)))
    .slice(0, 5);

  // Known demand moments ahead — the calendar half of timing.
  const seasonal = upcomingMoments(business.category);

  // The analysis — written in the background right after onboarding. No page
  // load ever waits on it: missing or outdated briefs (re)generate after the
  // response, and the teaser below shows a writing-it state meanwhile.
  const brief = await repo.getBusinessBrief(business.id);
  if (
    (!brief && !briefLikelyInFlight(business.created_at)) ||
    (brief &&
      (brief.prompt_version !== BRIEF_PROMPT_VERSION ||
        // A template brief upgrades to the real analysis once Gemini is keyed.
        (brief.model_used === BRIEF_FALLBACK_MODEL && isGeminiConfigured)))
  ) {
    after(async () => {
      try {
        const hadBrief = Boolean(brief);
        await repo.upsertBusinessBrief(
          await generateBusinessBrief(business, await repo.listServices(business.id)),
        );
        // A brand-new analysis means the current ranking was never judged
        // against it — rebuild. (Version upgrades keep the week stable.)
        if (!hadBrief) {
          const { rerankWeek } = await import("@/lib/recommend/rerank");
          await rerankWeek(getAdminRepo(), business);
        }
      } catch (err) {
        console.warn("[app] brief refresh failed (non-fatal):", (err as Error).message);
      }
    });
  }

  const recentCampaigns = campaigns.slice(0, 4);

  // What changed since last week, the rivals, and the plan that gates
  // rival tracking — read together; each is small.
  const [lastWeekOpps, competitors, competitorReads, plan] = await Promise.all([
    repo.listOpportunities(business.id, previousWeek(week)),
    repo.listCompetitors(business.id),
    repo.listCompetitorReads(business.id, { sinceDays: 14 }),
    getPlanState(repo, business),
  ]);
  const withSignals = async (rows: typeof active) =>
    Promise.all(rows.map(async (o) => ({ opportunity: o, signal: pickSignals.get(o.id) ?? (await repo.getSignal(o.signal_id)) })));
  const changes = [
    ...rankingChanges(await withSignals(active), await withSignals(lastWeekOpps.filter((o) => o.status !== "dismissed"))),
    ...rivalChanges(competitors, competitorReads),
  ];
  // Week one: every pick is an evergreen watch term with no measured week.
  const baselineWeek =
    picks.length > 0 &&
    picks.every((o) => pickSignals.get(o.id)?.source === "snapshot") &&
    (explained?.unmeasured ?? true);
  const firstMeasuredBy = fmtDate(
    new Date(new Date(`${week}T00:00:00Z`).getTime() + 7 * 86400_000).toISOString().slice(0, 10),
  );
  const rankedAt = lead ? new Date(lead.created_at) : null;
  // The ad itself, when it exists: the first headline and primary text feed
  // the in-feed preview that now sits where the grade ring used to.
  const measuredResults = learnings.some((l) => l.source === "measured") || results.length > 0;
  const creatives = campaign ? await repo.listCreatives(campaign.id) : [];
  const headline0 = creatives.find((c) => c.kind === "headline" && c.variant_index === 0)?.content ?? campaign?.hook ?? "";
  const primary0 = creatives.find((c) => c.kind === "primary_text" && c.variant_index === 0)?.content ?? campaign?.angle ?? "";
  const campaignLive = campaign ? campaign.status === "live" || campaign.status === "complete" : false;
  const canPass = Boolean(campaign && !campaignLive && campaignRebuildable(campaign.status) && runnerUps.length > 0);
  const budget = budgetFor(business.price_band);
  // The week's ad is written without being asked. Missing one (a fresh
  // ranking, a passed pick, a build that died) is written after this
  // response; the page shows "writing…" and refreshes into it.
  const building = Boolean(signal) && shouldAutoBuild(top, Boolean(campaign), plan.locked);
  if (building) {
    after(async () => {
      try {
        await ensureWeekCampaign(repo, business, top);
      } catch (err) {
        console.warn("[app] auto-build failed (non-fatal):", (err as Error).message);
      }
    });
  }
  // Standing questions: answered Monday by the cron; brand-new ones are
  // answered on the spot by their action. Nothing here waits on a model.
  const standing = await repo.listStandingQuestions(business.id, { activeOnly: true });
  const standingSuggestions = suggestStandingQuestions(business, services, brief, standing);
  const readBlock = (
    <>
      {read && (
        <div style={{ margin: "0 0 18px", maxWidth: 640 }}>
          {read.paragraphs.map((p, i) => (
            <p
              key={p.slice(0, 40)}
              style={{
                fontSize: i === 0 ? 15.5 : 14,
                fontWeight: i === 0 ? 500 : 400,
                lineHeight: 1.65,
                color: i === 0 ? "var(--ink)" : "var(--ink-soft)",
                margin: "0 0 10px",
              }}
            >
              {p}
            </p>
          ))}
        </div>
      )}
      {readInFlight && (
        <p style={{ margin: "0 0 14px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-faint)" }}>
          TRND is writing the read on this pick — it lands in a moment.
        </p>
      )}
    </>
  );
  const scoreCard = (
    <div className="score-card score-card--hero">
      <GradeRing score={Number(top.score)} />
      {explained && <ScoreBreakdown components={explained.components} showTrackRecord={measuredResults} />}
    </div>
  );
  const latestRead = (competitorId: string, kind: "ads" | "reviews") =>
    competitorReads
      .filter((r) => r.competitor_id === competitorId && r.kind === kind)
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0] ?? null;
  const forecast = forecastLine(forecastFlight({ daily: budgetFor(business.price_band).daily, category: business.category }));

  return (
    <div className="page">
      {(building || readInFlight) && <AutoRefresh everyMs={6000} times={building ? 15 : 3} />}
      <div className="page-head">
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>This week&apos;s recommendation · {weekRange}</span>
          <h1>This week</h1>
          <p className="context">
            <b>{titleCase(business.category)}</b> · {business.city}
            {business.region ? `, ${business.region}` : ""} · {business.radius_miles} mile radius ·{" "}
            {rankedAt
              ? `Ranked ${rankedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : "Refreshed daily"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {signal?.source === "seed" && <SourceBadge source="seed" />}
          <Link href="/app/report" className="btn btn-ghost btn-sm">
            Full report
          </Link>
          <form action={refreshRankingAction}>
            <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Refreshing…">
              Refresh
            </SubmitButton>
          </form>
        </div>
      </div>

      {/* ---------- WHAT CHANGED SINCE LAST WEEK ---------- */}
      {changes.length > 0 && (
        <section className="panel" style={{ marginTop: 18, padding: "14px 20px" }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 8 }}>What changed since last week</span>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {changes.slice(0, 6).map((c) => (
              <li key={c.text} style={{ fontSize: 13.5, lineHeight: 1.5, color: c.kind === "rival" ? "var(--amber-text)" : "var(--ink-soft)" }}>
                {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- BASELINE WEEK ---------- */}
      {baselineWeek && (
        <section className="panel" style={{ marginTop: 18, padding: "14px 20px", borderStyle: "dashed" }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 4 }}>First week</span>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-soft)" }}>
            This week&apos;s picks are the demand terms from your analysis. Grades stay conservative until
            the first measured movement lands, usually by {firstMeasuredBy}.
          </p>
        </section>
      )}

      {(launched.length > 0 || results.length > 0) && (
      <div className="kpi-row">
        <div className="kpi">
          <span className="k">Market reads · 7d</span>
          <span className="v">{watched.length}</span>
          <span className="s">across {titleCase(business.category)}</span>
        </div>
        <div className="kpi">
          <span className="k">Ranked this week</span>
          <span className="v">{active.length}</span>
          <span className="s">opportunities above threshold</span>
        </div>
        <div className="kpi">
          <span className="k">Campaigns launched</span>
          <span className="v">{launched.length}</span>
          <span className="s">{campaigns.length === 0 ? "first one is a click away" : `${campaigns.length} generated total`}</span>
        </div>
        <div className="kpi">
          <span className="k">Avg CTR to date</span>
          <span className="v">
            {avgCtr !== null ? (avgCtr * 100).toFixed(2) : "—"}
            {avgCtr !== null && <small>%</small>}
          </span>
          <span className={avgCtr !== null && avgCtr > 0.015 ? "s up" : "s"}>
            {avgCtr !== null ? "from your recorded results" : "record results to track this"}
          </span>
        </div>
      </div>
      )}

      {ledger.spendCents > 0 && (
        <div className="panel" style={{ marginTop: 18, padding: "14px 20px", display: "flex", gap: 24, alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="mono-label">TRND campaigns to date</span>
          <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15 }}>
            ${(ledger.spendCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} spent
          </span>
          {ledger.bookings > 0 && (
            <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15 }}>{ledger.bookings} bookings</span>
          )}
          {ledger.revenueCents > 0 && (
            <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, color: "var(--mint-text)" }}>
              ${(ledger.revenueCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} back
              {ledger.spendCents > 0 ? ` · ${(ledger.revenueCents / ledger.spendCents).toFixed(1)}×` : ""}
            </span>
          )}
          <span className="mono-label" style={{ marginLeft: "auto" }}>
            {ledger.synced ? "auto-synced from Meta" : "from your recorded results"}
          </span>
        </div>
      )}

      {unreadAlerts.length > 0 && (
        // A notification strip, not a content panel — one alert must read as
        // one compact line, not a card that is mostly padding.
        <section className="panel" style={{ margin: "18px 0", padding: "14px 26px 12px" }}>
          <div className="panel__head" style={{ marginBottom: 4 }}>
            <span className="panel__title">What changed</span>
            <form action={markAlertsReadAction}>
              <button type="submit" className="panel__meta" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--amber-text)", fontFamily: "var(--mono)" }}>
                mark all read
              </button>
            </form>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {unreadAlerts.map((a, i) => (
              <Link
                key={a.id}
                href={a.href}
                className="alert-row"
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "8px 0",
                  borderBottom: i < unreadAlerts.length - 1 ? "1px dashed var(--line)" : "none",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--amber)", flex: "0 0 auto", transform: "translateY(-2px)" }} />
                <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 13.5 }}>{a.title}</span>
                <span style={{ fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.5 }}>{a.body}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------- THIN WEEK: THE ANSWER FIRST ----------
          When no trend clears the bar, the recommendation IS the
          service-anchored moves from the analysis — they lead, in the hero
          slot, and the closest trend demotes to market context below. */}
      {weekThin && brief && brief.first_moves.length > 0 && (
        <section className="panel panel--hero" style={{ marginTop: 18, padding: "30px 32px 28px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <span className="badge badge--amber"><i />This week&apos;s play</span>
            <span className="panel__meta">No trend fits this week</span>
          </div>
          <h2 className="h-disp" style={{ fontSize: "clamp(22px,2.6vw,30px)", margin: "0 0 8px", lineHeight: 1.12, letterSpacing: "-0.02em" }}>
            No trend fits this week. Run your own moves.
          </h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", margin: "0 0 22px", maxWidth: 640 }}>
            From your analysis, priced from your own menu.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
            {brief.first_moves.slice(0, 3).map((move, i) => (
              <div key={move} style={{ borderLeft: "2px solid var(--amber)", paddingLeft: 14 }}>
                <span className="mono-label" style={{ display: "block", marginBottom: 6 }}>Move {i + 1}</span>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>{move}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
            <Link href="/app/snapshot" className="btn btn-primary">
              Full analysis
            </Link>
            <Link href="/app/report" className="btn btn-ghost btn-sm">
              Weekly report
            </Link>
          </div>
        </section>
      )}

      {/* ---------- HERO: THIS WEEK'S AD ----------
          The product is the finished ad, so the hero IS the ad — hook, offer,
          who sees it, what to spend, a way in ("Open the campaign") and a way
          out ("Not this one"). The evidence — the read, the insight lines,
          the grade and meters, the playbook, the rivals' ads — sits one
          click down under "Why this pick". Until the ad is written (a
          minute, in the background) or on a thin week, the pick leads. */}
      <section className={thin ? "panel" : "panel panel--hero"} style={{ padding: "30px 32px 28px", marginTop: 18 }}>
        {picks.length > 1 && (
          /* The switcher used to be a full-width tab strip that shouted louder
             than the pick it framed. It's a quiet control now — position, arrows,
             and the full list one click down. */
          <nav className="pick-switch" aria-label="This week's picks">
            <Link
              href={pickIndex === 0 ? `/app?pick=${picks.length}` : pickIndex === 1 ? "/app" : `/app?pick=${pickIndex}`}
              scroll={false}
              className="pick-switch__arrow"
              aria-label="Previous pick"
            >
              ‹
            </Link>
            <details className="pick-switch__menu">
              <summary className="pick-switch__trigger">
                <span className="pick-switch__label">
                  Pick <b>{pickIndex + 1}</b> of {picks.length}
                </span>
                <svg className="pick-switch__chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </summary>
              <div className="pick-switch__pop">
                <p className="mono-label pick-switch__head">This week&apos;s picks</p>
                {picks.map((o, i) => {
                  const s = pickSignals.get(o.id);
                  const on = i === pickIndex;
                  return (
                    <Link
                      key={o.id}
                      href={i === 0 ? "/app" : `/app?pick=${i + 1}`}
                      scroll={false}
                      className={`pick-switch__item${on ? " pick-switch__item--on" : ""}`}
                      aria-current={on ? "page" : undefined}
                    >
                      <span className="pick-switch__rank">#{i + 1}</span>
                      <span className="pick-switch__term">{s ? titleCase(s.term) : "Opportunity"}</span>
                      <GradePill score={Number(o.score)} />
                    </Link>
                  );
                })}
              </div>
            </details>
            <Link
              href={pickIndex + 1 >= picks.length ? "/app" : `/app?pick=${pickIndex + 2}`}
              scroll={false}
              className="pick-switch__arrow"
              aria-label="Next pick"
            >
              ›
            </Link>
          </nav>
        )}
        <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 400px", minWidth: 280 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <span className="badge badge--amber">
                <i />
                {campaign
                  ? isLead
                    ? "This week's ad"
                    : `Pick #${pickIndex + 1} · written`
                  : isLead
                    ? thin
                      ? "Closest trend — market context, not a pick"
                      : "#1 this week"
                    : `#${pickIndex + 1} this week${thin ? " — below the bar" : ""}`}
              </span>
              {typeof signal?.delta_pct === "number" &&
                (deltaShort(signal.delta_pct) === "steady" ? (
                  <span className="delta-chip">Steady this week</span>
                ) : (
                  <DeltaChip delta={signal.delta_pct} suffix={deltaWindowLabel(signal.source)} />
                ))}
            </div>
            {campaign ? (
              <>
                <span className="mono-label" style={{ display: "block", marginBottom: 10 }}>
                  Based on “{signal ? titleCase(signal.term) : "this week's pick"}”
                </span>
                <h2 className="h-disp" style={{ fontSize: "clamp(24px,3vw,34px)", margin: "0 0 12px", lineHeight: 1.12, letterSpacing: "-0.02em" }}>
                  {campaign.hook}
                </h2>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-soft)", margin: "0 0 18px", maxWidth: 640 }}>{campaign.angle}</p>
                <div className="facts-grid" style={{ marginBottom: 22 }}>
                  <div>
                    <span className="k" style={{ color: "var(--amber-text)" }}>Offer</span>
                    <p className="v" style={{ fontWeight: 600, fontFamily: "var(--disp)" }}>{campaign.offer}</p>
                  </div>
                  <div>
                    <span className="k">Who sees it</span>
                    <p className="v" style={{ fontSize: 13.5 }}>
                      {campaign.audience.who} · {campaign.audience.age_range} · {campaign.audience.radius_miles} mi
                    </p>
                  </div>
                  <div>
                    <span className="k">Spend</span>
                    <p className="v" style={{ fontSize: 13.5 }}>{budget.daily} a day · {budget.test}</p>
                  </div>
                  <div>
                    <span className="k">{campaignLive ? "Status" : "Launch by"}</span>
                    <p className="v" style={{ fontSize: 13.5 }}>{campaignLive ? "Live — record results when the flight ends" : launchBy}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                  <Link href={`/app/campaigns/${campaign.id}`} className="btn btn-primary">
                    Open the campaign
                  </Link>
                  {canPass && (
                    <form action={passOnPickAction}>
                      <input type="hidden" name="opportunity_id" value={top.id} />
                      <SubmitButton className="btn btn-ghost" pendingLabel="Writing the next one…">
                        Skip
                      </SubmitButton>
                    </form>
                  )}
                  <Link href="/app/opportunities" className="btn btn-ghost btn-sm">
                    All ranked
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="h-disp" style={{ fontSize: thin ? "clamp(20px,2.4vw,26px)" : "clamp(26px,3.2vw,38px)", margin: "0 0 16px", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
                  {signal ? titleCase(signal.term) : "This week's opportunity"}
                </h2>
                {readBlock}
                <InsightList
                  insights={insights}
                  footnote={top.competitor_gap ? `Saturation read: ${top.competitor_gap}.` : null}
                />
                {building && (
                  <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 560 }}>
                    <span className="mono-label" style={{ color: "var(--amber-text)", display: "block", marginBottom: 4 }}>Writing this week&apos;s ad</span>
                    About a minute. This page refreshes itself.
                  </p>
                )}
                {!building && plan.locked && (
                  <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 560 }}>
                    {plan.lockedReason}{" "}
                    <Link href="/app/settings#billing" style={{ color: "var(--amber-text)" }}>Choose a plan</Link>
                  </p>
                )}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
                  {!building && !plan.locked && (thin ? (
                    <BuildCampaignButton opportunityId={top.id} className="btn btn-ghost">
                      Build anyway
                    </BuildCampaignButton>
                  ) : (
                    <BuildCampaignButton opportunityId={top.id} />
                  ))}
                  <Link href="/app/opportunities" className="btn btn-ghost btn-sm">
                    All ranked
                  </Link>
                </div>
              </>
            )}
          </div>

          {campaign ? (
            <div style={{ flex: "0 1 340px", minWidth: 280 }}>
              <AdPreview
                businessName={business.name}
                primaryText={primary0}
                headline={headline0}
                mediaLine={campaign.offer}
                imageUrl={business.photo_urls[0] ?? null}
              />
            </div>
          ) : (
            scoreCard
          )}
        </div>

        {campaign ? (
          /* The evidence, one click down. Everything the hero used to lead
             with is still here, unchanged — it just no longer stands between
             the owner and the ad. */
          <details className="howto">
            <summary>
              Why this pick
              <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </summary>
            <div style={{ paddingTop: 16 }}>
              <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 400px", minWidth: 280 }}>
                  {readBlock}
                  <InsightList
                    insights={insights}
                    footnote={top.competitor_gap ? `Saturation read: ${top.competitor_gap}.` : null}
                  />
                </div>
                <div>
                  {scoreCard}
                  {signal && (
                    <div style={{ marginTop: 10 }}>
                      <SourceBadge source={signal.source} metric={signal.metric_type} term={signal.term} geo={signal.geo} raw={signal.raw} />
                    </div>
                  )}
                </div>
              </div>
              {howto && (
                <div className="howto-body">
              <div className="howto-col">
                <span className="k">Content angle</span>
                <p>{howto.contentAngle}</p>
              </div>
              <div className="howto-col">
                <span className="k">Caption direction</span>
                <p>{howto.captionDirection}</p>
              </div>
              <div className="howto-col">
                <span className="k">Hashtags to use</span>
                <div className="tag-row">
                  {howto.hashtags.map((h) => (
                    <span key={h}>#{h}</span>
                  ))}
                </div>
              </div>
                </div>
              )}
        <div className="meta-row">
          <div>
            <span className="k">Matched service</span>
            <div className="v">{matchedService ? matchedService.name : "New offer — nothing on your menu yet"}</div>
          </div>
          <div>
            <span className="k">Competition</span>
            <div className="v">{top.competitor_gap ? sentenceCase(top.competitor_gap) : "No ad read yet"}</div>
          </div>
          <div>
            <span className="k">Do this next</span>
            <div className="v">
              {thin
                ? weekThin && brief && brief.first_moves.length > 0
                  ? "Run this week's play above — it's anchored to your menu. Build this trend only if the creative is trivial."
                  : isLead
                    ? "Nothing squarely fits what you sell — lead with your own menu, and build this only if the creative is trivial."
                    : "Below the bar for paid spend — the higher-ranked picks are the better bet this week."
                : campaign
                  ? nextAction.label
                  : `${nextAction.label} — launch by ${launchBy}`}
            </div>
          </div>
          <div>
            <span className="k">Coverage</span>
            <div className="v">
              {business.city} · {business.radius_miles} miles
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span className="k">Expected return from a 6-day test</span>
            <div className="v" style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-soft)" }}>{forecast}</div>
          </div>
        </div>

        {adRead && adAssessment && competitorAds.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px dashed var(--line)" }}>
            <span className="mono-label" style={{ display: "block", marginBottom: 12 }}>
              {adAssessment.count !== null && adAssessment.count <= AD_COUNT_LOCAL_MAX
                ? `What competitors are running · ${adAssessment.count === adRead.value ? "" : "≈"}${adAssessment.count} active Meta ad${adAssessment.count === 1 ? "" : "s"} on this`
                : `Ads on this term · ${adRead.value} keyword matches on Meta, mostly unrelated — the ones that fit:`}
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {competitorAds.map((ad) => (
                <div key={ad.advertiser} style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 13 }}>{ad.advertiser}</span>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)", margin: "5px 0 0" }}>
                    “{ad.snippet.length > 140 ? `${ad.snippet.slice(0, 137)}…` : ad.snippet}”
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

            </div>
          </details>
        ) : (
          <>
        {howto && (
          <details className="howto" open>
            <summary>
              How to run it
              <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </summary>
            <div className="howto-body">
              <div className="howto-col">
                <span className="k">Content angle</span>
                <p>{howto.contentAngle}</p>
              </div>
              <div className="howto-col">
                <span className="k">Caption direction</span>
                <p>{howto.captionDirection}</p>
              </div>
              <div className="howto-col">
                <span className="k">Hashtags to use</span>
                <div className="tag-row">
                  {howto.hashtags.map((h) => (
                    <span key={h}>#{h}</span>
                  ))}
                </div>
              </div>
            </div>
          </details>
        )}

        <div className="meta-row">
          <div>
            <span className="k">Matched service</span>
            <div className="v">{matchedService ? matchedService.name : "New offer — nothing on your menu yet"}</div>
          </div>
          <div>
            <span className="k">Competition</span>
            <div className="v">{top.competitor_gap ? sentenceCase(top.competitor_gap) : "No ad read yet"}</div>
          </div>
          <div>
            <span className="k">Do this next</span>
            <div className="v">
              {thin
                ? weekThin && brief && brief.first_moves.length > 0
                  ? "Run this week's play above — it's anchored to your menu. Build this trend only if the creative is trivial."
                  : isLead
                    ? "Nothing squarely fits what you sell — lead with your own menu, and build this only if the creative is trivial."
                    : "Below the bar for paid spend — the higher-ranked picks are the better bet this week."
                : campaign
                  ? nextAction.label
                  : `${nextAction.label} — launch by ${launchBy}`}
            </div>
          </div>
          <div>
            <span className="k">Coverage</span>
            <div className="v">
              {business.city} · {business.radius_miles} miles
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span className="k">Expected return from a 6-day test</span>
            <div className="v" style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-soft)" }}>{forecast}</div>
          </div>
        </div>

        {adRead && adAssessment && competitorAds.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px dashed var(--line)" }}>
            <span className="mono-label" style={{ display: "block", marginBottom: 12 }}>
              {adAssessment.count !== null && adAssessment.count <= AD_COUNT_LOCAL_MAX
                ? `What competitors are running · ${adAssessment.count === adRead.value ? "" : "≈"}${adAssessment.count} active Meta ad${adAssessment.count === 1 ? "" : "s"} on this`
                : `Ads on this term · ${adRead.value} keyword matches on Meta, mostly unrelated — the ones that fit:`}
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {competitorAds.map((ad) => (
                <div key={ad.advertiser} style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 13 }}>{ad.advertiser}</span>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)", margin: "5px 0 0" }}>
                    “{ad.snippet.length > 140 ? `${ad.snippet.slice(0, 137)}…` : ad.snippet}”
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

          </>
        )}

        <PickAsk
          opportunityId={top.id}
          questions={askQuestions}
          hasCampaign={Boolean(campaign)}
          rebuildable={campaign ? campaignRebuildable(campaign.status) : true}
        />
      </section>

      {/* ---------- THE QUESTIONS THAT NEVER CLOSE ---------- */}
      <StandingQuestions questions={standing} suggestions={standingSuggestions} modelReady={isGeminiConfigured} />

      {/* ---------- TREND CHART (only when we hold a series worth reading:
          a sparse, mostly-zero niche series would headline a fake "0") ---------- */}
      {series.length >= 2 && !interestSparse && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title mint">Demand — {series.length >= 14 ? "30 days" : "this week"}</span>
            <span className="panel__meta">
              {signal ? `${signal.normalized_term.replace(/_/g, " ")} · ${geoLabel(signal.geo)}` : ""}
              {signal?.source === "seed" ? " · sample data" : ""}
            </span>
          </div>
          <TrendChart
            points={series}
            weeklyDeltaPct={typeof signal?.delta_pct === "number" ? signal.delta_pct : null}
            unitHint={
              signal?.source === "dataforseo"
                ? "monthly searches for this term, by day observed"
                : "search interest index — 100 is this term's recent peak, 0 its quietest day"
            }
            sourceHref={signal ? sourceUrl(signal) : null}
          />
        </section>
      )}

      {/* ---------- RUNNER-UPS + MARKET PULSE ---------- */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, marginTop: 18, alignItems: "start" }} className="two-col">
        {runnerUps.length > 0 && (
          <section className="panel">
            <div className="panel__head">
              <span className="panel__title">{isLead ? "Next in line" : "Also this week"}</span>
              <Link href="/app/opportunities" className="panel__meta" style={{ color: "var(--amber-text)" }}>
                View all
              </Link>
            </div>
            {weekThin && (
              <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-faint)" }}>
                None of these fit what you sell this week — shown as market context, graded accordingly.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {runnerUps.map((o, i) => {
                const s = runnerSignals.get(o.id);
                const ex = runnerExplained.get(o.id);
                const rank = active.indexOf(o) + 1;
                return (
                  <Link
                    key={o.id}
                    href={rank === 1 ? "/app" : `/app?pick=${rank}`}
                    scroll={false}
                    className="runner-link"
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      padding: "13px 0",
                      borderBottom: i < runnerUps.length - 1 ? "1px dashed var(--line)" : "none",
                    }}
                  >
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "var(--ink-faint)", fontSize: 14, width: 22 }}>
                      #{rank}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5 }}>{s ? titleCase(s.term) : ""}</span>
                      <span className="panel__meta" style={{ display: "block", marginTop: 2 }}>
                        {typeof s?.delta_pct === "number" ? `${deltaShort(s.delta_pct)} · ` : ""}
                        {s?.metric_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    {ex && <GradePill score={Number(o.score)} />}
                    <span className="runner-link__go" aria-hidden="true">›</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel__head">
            <span className="panel__title mint">Market movement</span>
            <span className="panel__meta">Change vs last week</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {movers.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "10px 0",
                  borderBottom: i < movers.length - 1 ? "1px dashed var(--line)" : "none",
                }}
              >
                <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{titleCase(s.term)}</span>
                <DeltaChip delta={s.delta_pct ?? 0} />
              </div>
            ))}
            {movers.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-faint)" }}>No movement captured this week.</p>
            )}
          </div>
        </section>
      </div>

      {/* ---------- YOUR RIVALS ---------- */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel__head">
          <span className="panel__title">Competitors</span>
          <Link href="/app/settings" className="panel__meta" style={{ color: "var(--amber-text)" }}>
            {competitors.length > 0 ? "Manage" : "Settings"}
          </Link>
        </div>
        {competitors.length === 0 ? (
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-soft)", flex: "1 1 320px" }}>
              No competitors yet.
            </p>
            {isPlacesConfigured && (
              <form action={seedCompetitorsAction}>
                <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Finding…">
                  Find nearby competitors
                </SubmitButton>
              </form>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {competitors.slice(0, 6).map((c) => {
              const ads = latestRead(c.id, "ads");
              const rev = latestRead(c.id, "reviews");
              return (
                <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "12px 14px", background: "var(--bg-1)" }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>{c.name}</span>
                  <span className="mono-label" style={{ display: "block" }}>
                    {ads && typeof ads.value === "number"
                      ? `${ads.value} active Meta ad${ads.value === 1 ? "" : "s"}`
                      : "ads: first read tonight"}
                  </span>
                  <span className="mono-label" style={{ display: "block", marginTop: 3 }}>
                    {rev && typeof rev.rating === "number"
                      ? `${rev.rating.toFixed(1)}★ · ${rev.value ?? "—"} reviews`
                      : "rating: first read tonight"}
                  </span>
                  {(ads?.summary || rev?.summary) && (
                    <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-soft)" }}>{ads?.summary ?? rev?.summary}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- THE FREE MOVE ---------- */}
      {organicPost && (
        <section className="panel" style={{ marginTop: 18 }}>
          <CopyBlock label="Free post for this week" content={organicPost} />
        </section>
      )}

      {/* ---------- SEASONAL CALENDAR ---------- */}
      {seasonal.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title">Coming up</span>
            <span className="panel__meta">Known demand moments</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            {seasonal.map((m) => (
              <div key={m.label} style={{ borderLeft: `2px solid ${m.prepNow ? "var(--amber)" : "var(--line-strong)"}`, paddingLeft: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5 }}>{m.label}</span>
                  <span className="mono-label" style={{ color: m.prepNow ? "var(--amber-text)" : undefined, whiteSpace: "nowrap" }}>
                    {m.daysOut <= 1 ? "now" : `${m.daysOut}d out`}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)", margin: "6px 0 0" }}>
                  {m.prepNow ? "Start now — " : `Start ~${Math.max(1, Math.round((m.daysOut - m.leadWeeks * 7) / 7))} wk${Math.round((m.daysOut - m.leadWeeks * 7) / 7) === 1 ? "" : "s"} from now. `}
                  {m.advice}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!brief && (
        <section className="snap-teaser">
          <div className="snap-teaser__left">
            <div>
              <h4>Your founding analysis is being written</h4>
              <p>
                TRND is reading {business.name} — positioning, customers, market, first moves.
                Usually under two minutes.
              </p>
            </div>
          </div>
          <Link href="/app/snapshot" className="btn btn-ghost btn-sm">
            Watch it land
          </Link>
        </section>
      )}
      {brief && (
        <section className="snap-teaser">
          <div className="snap-teaser__left">
            <div>
              <h4>How TRND reads {business.name}</h4>
              <p>
                {titleCase(business.category)} · {business.city}
                {business.region ? `, ${business.region}` : ""} · {services.filter((s) => s.is_active).length} services on file
              </p>
            </div>
            <div className="mini-chip-row">
              {brief.advantages[0] && <span className="mini-chip">Edge: {brief.advantages[0]}</span>}
              {brief.watchouts[0] && <span className="mini-chip">Watch-out: {brief.watchouts[0]}</span>}
            </div>
          </div>
          <Link href="/app/snapshot" className="btn btn-ghost btn-sm">
            View full snapshot
          </Link>
        </section>
      )}

      {/* ---------- RECENT CAMPAIGNS ---------- */}
      {recentCampaigns.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <div className="panel__head" style={{ marginBottom: 12 }}>
            <span className="panel__title">Recent campaigns</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {recentCampaigns.map((c) => (
              <Link key={c.id} href={`/app/campaigns/${c.id}`} className="card" style={{ padding: 18, display: "block" }}>
                <span className={`badge${c.status === "live" || c.status === "complete" ? " badge--mint" : ""}`}>
                  <i />
                  {c.status}
                </span>
                <p style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 15, margin: "10px 0 4px", lineHeight: 1.3 }}>
                  {c.hook}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: 0 }}>
                  {fmtDate(c.created_at.slice(0, 10))} · {c.channel}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
