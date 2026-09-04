import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AutoRefresh from "@/components/app/auto-refresh";
import ScoreBreakdown from "@/components/app/score-breakdown";
import GradePill from "@/components/app/grade-pill";
import GradeRing from "@/components/app/grade-ring";
import SubmitButton from "@/components/app/submit-button";
import SourceBadge from "@/components/app/source-badge";
import TrendChart from "@/components/app/trend-chart";
import InsightList from "@/components/app/insight-list";
import { getSessionUser } from "@/lib/auth/session";
import BuildCampaignButton from "@/components/app/build-campaign-button";
import { markAlertsReadAction } from "@/lib/intel/actions";
import { refreshRankingAction } from "@/lib/recommend/actions";
import { getUserRepo } from "@/lib/db";
import type { Signal } from "@/lib/db/types";
import { explainOpportunity } from "@/lib/recommend/explain";
import CopyBlock from "@/components/app/copy-block";
import { buildHowTo, tiktokHashtag } from "@/lib/recommend/howto";
import { buildOrganicPost } from "@/lib/recommend/post";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { buildInsights, buildNextAction } from "@/lib/recommend/insights";
import { BRIEF_FALLBACK_MODEL, BRIEF_PROMPT_VERSION, briefLikelyInFlight, generateBusinessBrief } from "@/lib/ai/brief";
import { isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";
import { geoLabel } from "@/lib/signals/geo";
import { titleCase } from "@/lib/text";

export const metadata = { title: "This week — TRND" };

function fmtDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export default async function AppHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const week = weekOf();
  let opportunities = await repo.listOpportunities(business.id, week);
  if (opportunities.length === 0) {
    // First visit of the week: score what we have right now so the screen is
    // never empty. The weekly cron does the same in bulk.
    await recommendForBusiness(repo, business);
    opportunities = await repo.listOpportunities(business.id, week);
  }

  const active = opportunities.filter((o) => o.status !== "dismissed");
  const top = active[0] ?? null;

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
            await rerankWeek(repo, business);
          } catch (err) {
            console.warn("[app] brief recovery failed (non-fatal):", (err as Error).message);
          }
        });
      }
      return (
        <div className="page">
          <AutoRefresh />
          <div className="page-head">
            <div>
              <span className="eyebrow" style={{ margin: 0 }}>This week · {weekRange}</span>
              <h1>TRND is reading {business.name}.</h1>
              <p className="context">
                Positioning, customers, demand terms, first moves — the founding analysis is
                being written now, and your first judged ranking lands with it. Usually under
                two minutes; this page refreshes itself.
              </p>
            </div>
          </div>
          <div className="panel" style={{ maxWidth: 620 }}>
            <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.65, fontSize: 14.5 }}>
              TRND never shows a ranking that hasn&apos;t been judged against what you actually
              sell — a minute of honest silence beats a week of confident nonsense.
            </p>
            <Link className="btn btn-ghost btn-sm" href="/app/snapshot" style={{ marginTop: 18 }}>
              Watch the analysis land →
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <span className="eyebrow" style={{ margin: 0 }}>This week · {weekRange}</span>
            <h1>No live signal for your category yet.</h1>
            <p className="context">
              Ingestion hasn&apos;t captured signal for <b>{business.category}</b> in the last
              two weeks — or everything this week was dismissed.
            </p>
          </div>
        </div>
        <div className="panel" style={{ maxWidth: 620 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.65, fontSize: 14.5 }}>
            TRND reads the market for you every day — the first ranking appears as soon as a
            read lands for your area. Nothing for you to do; check back soon.
          </p>
          {!isSupabaseConfigured && (
            <p style={{ margin: "12px 0 0", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-faint)" }}>
              dev note: run <code>pnpm seed</code> for illustrative data or <code>pnpm job:ingest</code> for live sources.
            </p>
          )}
          <Link className="btn btn-ghost btn-sm" href="/app/opportunities" style={{ marginTop: 18 }}>
            Review dismissed opportunities
          </Link>
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
  const competitorAds = (
    (adRead?.raw as { ads?: { advertiser: string; snippet: string }[] } | null)?.ads ?? []
  ).slice(0, 2);
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
  const launchBy = fmtDate(
    new Date(new Date(`${week}T00:00:00Z`).getTime() + 3 * 86400_000).toISOString().slice(0, 10),
  );
  const nextAction = buildNextAction({
    hasCampaign: Boolean(campaign),
    launchBy,
    priceBand: business.price_band,
  });

  // Runner-ups + their signals for the strip below the hero.
  const runnerUps = active.slice(1, 4);
  const runnerSignals = new Map<string, Signal | null>(
    await Promise.all(runnerUps.map(async (o) => [o.id, await repo.getSignal(o.signal_id)] as const)),
  );
  const runnerExplained = new Map(
    await Promise.all(
      runnerUps.map(async (o) => {
        const s = runnerSignals.get(o.id);
        return [o.id, s ? await explainOpportunity(repo, business, o, s) : null] as const;
      }),
    ),
  );

  // Market pulse: this week's top movers in the category.
  const movers = [...watched]
    .filter((s) => typeof s.delta_pct === "number")
    .sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))
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
          await rerankWeek(repo, business);
        }
      } catch (err) {
        console.warn("[app] brief refresh failed (non-fatal):", (err as Error).message);
      }
    });
  }

  const recentCampaigns = campaigns.slice(0, 4);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>This week&apos;s recommendation · {weekRange}</span>
          <h1>{business.name.endsWith("s") ? `${business.name}’` : `${business.name}’s`} week, read for you.</h1>
          <p className="context">
            <b>{business.category}</b> · {business.city}
            {business.region ? `, ${business.region}` : ""} · {business.radius_miles} mile radius ·
            signal refreshes daily
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {signal?.source === "seed" && <SourceBadge source="seed" />}
          <Link href="/app/report" className="btn btn-ghost btn-sm">
            Intel report →
          </Link>
          <form action={refreshRankingAction}>
            <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Re-reading the market…">
              Re-rank this week
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <span className="k">Market reads · 7d</span>
          <span className="v">{watched.length}</span>
          <span className="s">across {business.category.toLowerCase()}</span>
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
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
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
                  padding: "10px 0",
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

      {/* ---------- HERO RECOMMENDATION ---------- */}
      <section className="panel panel--hero" style={{ padding: "30px 32px 28px" }}>
        <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 400px", minWidth: 280 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <span className="badge badge--amber"><i />{thin ? "Closest fit — not a pick" : "#1 this week"}</span>
              {signal && <SourceBadge source={signal.source} metric={signal.metric_type} />}
              {typeof signal?.delta_pct === "number" && (
                <span className="delta-chip">↑{Math.round(signal.delta_pct)}% this week</span>
              )}
            </div>
            <h2 className="h-disp" style={{ fontSize: "clamp(26px,3.2vw,38px)", margin: "0 0 16px", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
              {signal ? titleCase(signal.term) : "This week's opportunity"}
            </h2>

            <InsightList
              insights={insights}
              footnote={top.competitor_gap ? `Saturation read: ${top.competitor_gap}.` : null}
            />

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
              {campaign ? (
                <Link href={`/app/campaigns/${campaign.id}`} className="btn btn-primary">
                  View the campaign →
                </Link>
              ) : thin ? (
                <BuildCampaignButton opportunityId={top.id} className="btn btn-ghost">
                  Build anyway
                </BuildCampaignButton>
              ) : (
                <BuildCampaignButton opportunityId={top.id} />
              )}
              <Link href="/app/opportunities" className="btn btn-ghost btn-sm">
                All {active.length} ranked →
              </Link>
            </div>

            {organicPost && (
              <div style={{ marginBottom: 18 }}>
                <CopyBlock label="No ad budget this week? Post this today — free" content={organicPost} />
              </div>
            )}

            {howto && (
              <details className="howto" open>
                <summary>
                  How to run it well
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
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 280, maxWidth: 400, display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
            <GradeRing score={Number(top.score)} />
            {explained && (
              <div style={{ width: "100%" }}>
                <ScoreBreakdown components={explained.components} />
              </div>
            )}
          </div>
        </div>

        <div className="meta-row">
          <div>
            <span className="k">Matched service</span>
            <div className="v">{matchedService ? matchedService.name : "New offer — nothing on your menu yet"}</div>
          </div>
          <div>
            <span className="k">Competition</span>
            <div className="v">{top.competitor_gap ?? "No ad read yet"}</div>
          </div>
          <div>
            <span className="k">Do this next</span>
            <div className="v">
              {thin
                ? "Thin week — nothing squarely fits what you sell. Wait, or build only if the creative is trivial."
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
        </div>

        {adRead && competitorAds.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px dashed var(--line)" }}>
            <span className="mono-label" style={{ display: "block", marginBottom: 12 }}>
              What competitors are running · {adRead.value} active Meta ad{adRead.value === 1 ? "" : "s"} on this
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
      </section>

      {/* ---------- THIN WEEK: WHAT TO RUN INSTEAD ----------
          When no trend fits, the useful advice isn't a trend at all — it's
          the service-anchored first moves from the founding analysis. */}
      {thin && brief && brief.first_moves.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title">Worth running instead</span>
            <span className="panel__meta">from your analysis — anchored to what you actually sell</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
            {brief.first_moves.slice(0, 3).map((move, i) => (
              <div key={move} style={{ borderLeft: "2px solid var(--amber)", paddingLeft: 14 }}>
                <span className="mono-label" style={{ display: "block", marginBottom: 6 }}>Move {i + 1}</span>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>{move}</p>
              </div>
            ))}
          </div>
          <Link href="/app/snapshot" className="btn btn-ghost btn-sm" style={{ marginTop: 18 }}>
            See the full analysis →
          </Link>
        </section>
      )}

      {/* ---------- TREND CHART (only when we hold a series worth reading:
          a sparse, mostly-zero niche series would headline a fake "0") ---------- */}
      {series.length >= 2 && !interestSparse && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title mint">Demand — {series.length >= 14 ? "30 days" : "this week"}</span>
            <span className="panel__meta">
              {signal ? `${signal.normalized_term.replace(/_/g, " ")} · ${geoLabel(signal.geo)}` : ""}
              {signal?.source === "seed" ? " · illustrative" : ""}
            </span>
          </div>
          <TrendChart points={series} />
        </section>
      )}

      {/* ---------- RUNNER-UPS + MARKET PULSE ---------- */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, marginTop: 18, alignItems: "start" }} className="two-col">
        {runnerUps.length > 0 && (
          <section className="panel">
            <div className="panel__head">
              <span className="panel__title">Next in line</span>
              <Link href="/app/opportunities" className="panel__meta" style={{ color: "var(--amber-text)" }}>
                view all →
              </Link>
            </div>
            {thin && (
              <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-faint)" }}>
                None of these fit what you sell this week — shown as market context, graded accordingly.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {runnerUps.map((o, i) => {
                const s = runnerSignals.get(o.id);
                const ex = runnerExplained.get(o.id);
                return (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      padding: "13px 0",
                      borderBottom: i < runnerUps.length - 1 ? "1px dashed var(--line)" : "none",
                    }}
                  >
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 700, color: "var(--ink-faint)", fontSize: 14, width: 22 }}>
                      #{i + 2}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5 }}>{s ? titleCase(s.term) : ""}</span>
                      <span className="panel__meta" style={{ display: "block", marginTop: 2 }}>
                        {typeof s?.delta_pct === "number" ? `↑${Math.round(s.delta_pct)}% · ` : ""}
                        {s?.metric_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    {ex && <GradePill score={Number(o.score)} />}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel__head">
            <span className="panel__title mint">Market pulse · 7d</span>
            <span className="panel__meta">{business.category.toLowerCase()}</span>
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
                <span className="delta-chip">↑{Math.round(s.delta_pct ?? 0)}%</span>
              </div>
            ))}
            {movers.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-faint)" }}>No movement captured this week.</p>
            )}
          </div>
        </section>
      </div>

      {/* ---------- SEASONAL CALENDAR ---------- */}
      {seasonal.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel__head">
            <span className="panel__title">Coming up — plan ahead</span>
            <span className="panel__meta">known demand moments for {business.category.toLowerCase()}</span>
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
            Watch it land →
          </Link>
        </section>
      )}
      {brief && (
        <section className="snap-teaser">
          <div className="snap-teaser__left">
            <div>
              <h4>How TRND reads {business.name}</h4>
              <p>
                {business.category} · {business.city}
                {business.region ? `, ${business.region}` : ""} · {services.filter((s) => s.is_active).length} services on file
              </p>
            </div>
            <div className="mini-chip-row">
              {brief.advantages[0] && <span className="mini-chip">Edge: {brief.advantages[0]}</span>}
              {brief.watchouts[0] && <span className="mini-chip">Watch-out: {brief.watchouts[0]}</span>}
            </div>
          </div>
          <Link href="/app/snapshot" className="btn btn-ghost btn-sm">
            View full snapshot →
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
