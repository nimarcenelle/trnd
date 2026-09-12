import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import AdCallCard from "@/components/app/ad-call-card";
import AnalysisProgress from "@/components/app/analysis-progress";
// Two different waits, two different tools. The empty states below have no
// pick to ask about and the whole page changes when the ranking lands, so
// they poll the page. The pick screen has content already on it, so it asks
// a cheap endpoint and repaints once — see AwaitContent.
import AutoRefresh from "@/components/app/auto-refresh";
import AwaitContent from "@/components/app/await-content";
import GradePill from "@/components/app/grade-pill";
import SubmitButton from "@/components/app/submit-button";
import PickBriefing from "@/components/app/pick-briefing";
import PickPager from "@/components/app/pick-pager";
import GradeCard from "@/components/app/grade-card";
import TrendChart from "@/components/app/trend-chart";
import PickAsk from "@/components/app/pick-ask";
import StandingQuestions from "@/components/app/standing-questions";
import { getSessionUser } from "@/lib/auth/session";
import BuildCampaignButton from "@/components/app/build-campaign-button";
import { markAlertsReadAction } from "@/lib/intel/actions";
import { suggestStandingQuestions } from "@/lib/intel/standing";
import { passOnPickAction, scanMarketNowAction } from "@/lib/recommend/actions";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import type { Signal } from "@/lib/db/types";
import { ensureWeekCampaign, shouldAutoBuild } from "@/lib/campaigns/auto";
import { indexSeries } from "@/lib/demand/series";
import { campaignRebuildable } from "@/lib/campaigns/build";
import { explainOpportunity } from "@/lib/recommend/explain";
import { buildPickFacts } from "@/lib/recommend/pick-facts";
import { buildBriefing } from "@/lib/recommend/briefing";
import { buildAdCall } from "@/lib/recommend/ad-call";
import { campaignSignalBrief, culturalForTerm, loadSignalContext, rivalTermRead } from "@/lib/recommend/four-signals";
import { culturalFromSignal } from "@/lib/scoring";
import { readAccount } from "@/lib/social/read";
import { buildSocialProof } from "@/lib/recommend/social-proof";
import { ensurePickRead, readIsCurrent } from "@/lib/recommend/read";
import { tiktokHashtag } from "@/lib/recommend/howto";
import { upcomingMoments } from "@/lib/recommend/seasonal";
import { assessAdRead } from "@/lib/signals/ad-relevance";
import { getPlanState } from "@/lib/billing";
import { BRIEF_FALLBACK_MODEL, BRIEF_PROMPT_VERSION, briefLikelyInFlight, businessJustOnboarded, generateBusinessBrief, targetCustomerOf } from "@/lib/ai/brief";
import { isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { recommendForBusiness, weekOf } from "@/lib/recommend/recommend";
import { businessStateGeo, geoLabel, isOnlineBusiness, placeLabel, placeWords } from "@/lib/signals/geo";
import { sourceUrl } from "@/lib/signals/source-url";
import { sentenceCase, titleCase } from "@/lib/text";

export const metadata = { title: "This week — TRND" };

function fmtDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
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
              <span className="eyebrow m-0">This week · {weekRange}</span>
              <h1>Reading your business</h1>
              <p className="context">
                Your analysis is being written. Your first ranking lands with it, usually within
                two minutes. This page refreshes itself.
              </p>
            </div>
          </div>
          <div className="panel max-w-[620px]">
            <AnalysisProgress startedAt={business.created_at} />
            <Link className="btn btn-ghost btn-sm mt-[18px]" href="/app/snapshot">
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
              <span className="eyebrow m-0">This week · {weekRange}</span>
              <h1>Reading your market</h1>
              <p className="context">
                Reading demand for <b>{business.category}</b> {isOnlineBusiness(business) ? "across the US" : `around ${business.city}`}, then ranking
                it against what you sell.
              </p>
            </div>
          </div>
          <div className="panel max-w-[620px]">
            <p className="m-0 text-ink-soft leading-[1.65] text-[14.5px]">
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
            <span className="eyebrow m-0">This week · {weekRange}</span>
            <h1>No recommendation this week</h1>
            <p className="context">
              This week&apos;s reads for <b>{titleCase(business.category)}</b> {isOnlineBusiness(business) ? "across the US" : `around ${business.city}`} didn&apos;t
              produce a pick worth spending on.
            </p>
          </div>
        </div>
        <div className="panel max-w-[620px]">
          <p className="m-0 text-ink-soft leading-[1.65] text-[14.5px]">
            The daily read continues. You can refresh it now.
          </p>
          <div className="flex gap-3 flex-wrap mt-[18px]">
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
  // Judged-thin week: even the pool's best sits below the worth-running bar.
  // The screen must not dress it up — no creative playbook, no "capture this
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
        placeWords(business),
        adRead.value as number,
      )
    : null;
  const competitorAds = (adAssessment?.ads ?? []).slice(0, 2);
  const explained = signal ? await explainOpportunity(repo, business, top, signal) : null;
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

  // The other picks + their signals: the pager's labels and "also ranked".
  const pickSignals = new Map<string, Signal | null>(
    await Promise.all(
      picks.map(async (o) => [o.id, o.id === top.id ? signal : await repo.getSignal(o.signal_id)] as const),
    ),
  );
  const runnerUps = picks.filter((o) => o.id !== top.id);

  // The analysis — written in the background right after onboarding. No page
  // load ever waits on it: missing or outdated briefs (re)generate after the
  // response.
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


  // What changed since last week, the rivals, and the plan that gates
  // rival tracking — read together; each is small.
  const [plan, termHistory] = await Promise.all([
    getPlanState(repo, business),
    // Eight weeks, for the demand line. The category read above is a 7-day
    // window — enough to rank this week, far too short to draw a trend.
    repo.listSignalsForCategory(business.category, { geo: businessStateGeo(business), sinceDays: 56 }),
  ]);
  // The nearest dated demand moment — a date beats a season in the briefing.
  const nextMoment = upcomingMoments(business.category)[0] ?? null;
  // The ad itself, when it exists: the first headline and primary text feed
  // the in-feed preview that now sits where the grade ring used to.
  const campaignLive = campaign ? campaign.status === "live" || campaign.status === "complete" : false;
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

  // ---- the call: run this ad, to whom, where, how, and why -----------------
  // Built from the same four-signal evidence the ranking read, so every
  // clause of it traces to a number the rest of this page shows.
  const signalCtx = signal ? await loadSignalContext(repo, business, brief, termHistory) : null;
  const signalBrief = signal && signalCtx ? campaignSignalBrief(signal, signalCtx) : null;
  const scripts = campaign
    ? (await repo.listCreatives(campaign.id))
        .filter((c) => c.kind === "script")
        .sort((a, b) => a.variant_index - b.variant_index)
        .map((c) => c.content)
    : [];
  const culturalRead = signal && signalCtx ? (culturalFromSignal(signal) ?? culturalForTerm(signal, signalCtx.shortform)) : null;
  const adCall =
    signal && signalCtx
      ? buildAdCall({
          term: signal.term,
          score: Number(top.score),
          signals: explained?.signals,
          signalReasons: explained?.signalReasons,
          service: explained?.matchedService ?? null,
          targetCustomer: targetCustomerOf(brief),
          campaign: campaign
            ? { angle: campaign.angle, hook: campaign.hook, offer: campaign.offer, audience: campaign.audience }
            : null,
          scripts,
          culturalPlatform: culturalRead?.platform ?? null,
          ownVideoShare: signalCtx.ownPosts.length >= 5 ? readAccount(signalCtx.ownPosts).videoShare : null,
          adPlatforms: business.ad_platforms,
          medianDurationSec: signalBrief?.medianDurationSec ?? null,
          weekPct: explained?.weekPct ?? null,
          monthPct: explained?.monthPct ?? null,
          geoLabel: geoLabel(signal.geo),
          audiencePhrase: explained?.audiencePhrase ?? null,
          rivals: rivalTermRead(signal.term, signalCtx),
          rivalThemes: signalBrief?.rivalThemes ?? [],
          ownBestTheme: signalBrief?.ownBestTheme ?? null,
        })
      : null;
  const rivalLines = signalBrief?.rivalLines ?? [];

  // ---- the five things an owner sweeps before spending money ----------------
  // Fixed slots, same order every pick: why, rating, demand, social, rivals.
  const briefingRows = buildBriefing({
    market: business.market,
    brief,
    matchedService: explained?.matchedService ?? null,
    services,
    priceBand: business.price_band,
    signal,
    adCount: adAssessment?.countUsable ? adAssessment.count : null,
    adAdvertisers: competitorAds.map((a) => a.advertiser),
    moment: nextMoment
      ? {
          label: nextMoment.label,
          when: nextMoment.prepNow
            ? "prep should already be underway"
            : `${nextMoment.daysOut} days out`,
        }
      : null,
    city: placeLabel(business),
  });
  // Signals for THIS term only, over eight weeks — the category read above is
  // a 7-day window and cannot draw a line.
  const termSignals = signal
    ? termHistory.filter((s) => s.normalized_term === signal.normalized_term)
    : [];
  // The last 30 days of this term's daily series, drawn as it is. A term
  // can hold a Trends index (0–100) and a raw search volume under one key;
  // mixed, the volume days spike off the chart — keep the index when both.
  const demandSeries = indexSeries(signal ? await repo.getSeries(signal.normalized_term, signal.geo, 30) : []);
  const social = buildSocialProof(termSignals);
  // Comes from the short-form read itself; see buildSocialProof.
  const proofHref = social.href;

  return (
    <div className="page pick">
      {(building || readInFlight) && (
        <AwaitContent opportunityId={top.id} needsRead={readInFlight} needsCampaign={building} />
      )}

      {/* What changed since they last looked. One line, dismissible, above
          everything — it is the only thing on this screen that is news. */}
      {unreadAlerts.length > 0 && (
        <form action={markAlertsReadAction} className="alertbar">
          <span className="alertbar__dot" aria-hidden="true" />
          <p className="alertbar__text">
            {unreadAlerts.length === 1 ? (
              <Link href={unreadAlerts[0].href}>{unreadAlerts[0].title}</Link>
            ) : (
              <>
                <Link href={unreadAlerts[0].href}>{unreadAlerts[0].title}</Link>
                {` and ${unreadAlerts.length - 1} other${unreadAlerts.length === 2 ? "" : "s"}`}
              </>
            )}
          </p>
          <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
            Mark read
          </SubmitButton>
        </form>
      )}

      <header className="pick__top">
        <div className="pick__id">
          <p className="pick__eyebrow">
            #{pickIndex + 1} this week · {geoLabel(signal?.geo ?? "US") || "your area"}
          </p>
          <h1 className="pick__title">{titleCase(signal?.term ?? top.rationale)}</h1>
        </div>
        <PickPager
          index={pickIndex}
          total={picks.length}
          terms={picks.map((o) => pickSignals.get(o.id)?.term ?? "pick")}
        />
      </header>

      <div className="pick__grid">
        <PickBriefing rows={briefingRows} />

        <main className="pick__main">
          {/* 0 · THE CALL --------------------------------------------------- */}
          {adCall && <AdCallCard call={adCall} campaignId={campaign?.id ?? null} building={building} />}

          {/* 1 · WHY ------------------------------------------------------- */}
          <section className="card pick__why">
            {read ? (
              read.paragraphs.map((para, i) => (
                <p key={para.slice(0, 40)} className={i === 0 ? "pick__lede" : "pick__para"}>
                  {para}
                </p>
              ))
            ) : readInFlight ? (
              <p className="pick__para">TRND is writing the read on this pick — it lands in a moment.</p>
            ) : (
              <p className="pick__lede">{sentenceCase(top.rationale)}</p>
            )}
          </section>

          {/* 2 · RATING + 3 · DEMAND --------------------------------------- */}
          <div className="pick__row">
            <GradeCard score={Number(top.score)} />
            <div className="card pick__demand">
              <p className="demand__eyebrow">Demand, last 30 days</p>
              <TrendChart points={demandSeries} weeklyDeltaPct={signal?.delta_pct ?? null} />
            </div>
          </div>

          {/* 4 · SOCIAL PROOF ---------------------------------------------- */}
          {social.summary && (
            <section className="card pick__social">
              <h2 className="pick__h">What short-form says</h2>
              <p className="pick__para">{social.summary}</p>
              {social.facts.length > 0 && (
                <dl className="factgrid">
                  {social.facts.map((f) => (
                    <div className="factgrid__cell" key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {social.examples.length > 0 ? (
                <ul className="proof">
                  {social.examples.map((e) => (
                    <li key={e.href + e.title}>
                      <a href={e.href} target="_blank" rel="noreferrer noopener">
                        {e.title}
                      </a>
                      <span>
                        {e.channel}
                        {e.meta ? ` · ${e.meta}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                proofHref && (
                  <p className="pick__note">
                    <a href={proofHref} target="_blank" rel="noreferrer noopener">
                      See this week&apos;s most-watched videos on this →
                    </a>
                  </p>
                )
              )}
            </section>
          )}

          {/* 5 · COMPETITIVE ----------------------------------------------- */}
          <section className="card pick__rivals">
            <h2 className="pick__h">Who else is going after this</h2>
            {adAssessment?.countUsable && typeof adAssessment.count === "number" ? (
              <>
                <p className="pick__para">
                  {adAssessment.count === 0
                    ? `${isOnlineBusiness(business) ? "No competing brand is" : `Nobody near ${business.city} is`} running ads on this right now, so you would be first into an open field.`
                    : `${adAssessment.count} advertiser${adAssessment.count === 1 ? "" : "s"}${isOnlineBusiness(business) ? "" : ` near ${business.city}`} ${adAssessment.count === 1 ? "is" : "are"} already running on this.`}
                  {adAssessment.unrelated > 0 &&
                    ` ${adAssessment.unrelated} keyword match${adAssessment.unrelated === 1 ? "" : "es"} were other industries and are not counted.`}
                </p>
                {competitorAds.length > 0 && (
                  <ul className="proof">
                    {competitorAds.map((ad) => (
                      <li key={ad.advertiser + ad.snippet.slice(0, 20)}>
                        <b>{ad.advertiser}</b>
                        <span>{ad.snippet.slice(0, 140)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="pick__para">
                {isOnlineBusiness(business)
                  ? "No readable ad count for this term yet. Treat the field as unknown rather than open."
                  : `No readable local ad count for this term. The keyword search returns national brand spend, which cannot describe ${business.city}. Treat the field as unknown rather than open.`}
              </p>
            )}
            {/* The scorer's gap line repeats the paragraph above almost
                word for word when the read is unusable — one finding, said
                once. Shown only when it adds something. */}
            {explained?.competitorGapText && adAssessment?.countUsable && (
              <p className="pick__note">{explained.competitorGapText}</p>
            )}
            {/* The rivals that matter: the direct ones, and what they are
                actually posting and paying to show on this. */}
            {rivalLines.length > 0 && (
              <>
                <h3 className="pick__h mt-4">What your direct rivals are doing on it</h3>
                <ul className="proof">
                  {rivalLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* the one thing to do next ------------------------------------- */}
          <div className="actionbar">
            {campaign ? (
              <>
                <p className="actionbar__text">
                  {campaignLive
                    ? "This campaign is live — results are tracking against it."
                    : "Your ad for this pick is written and ready to review."}
                </p>
                <Link className="btn btn-primary btn-lg" href={`/app/campaigns/${campaign.id}`}>
                  Open the campaign
                </Link>
              </>
            ) : building ? (
              <p className="actionbar__text">TRND is writing the ad for this pick — it lands in a moment.</p>
            ) : plan.locked ? (
              <>
                <p className="actionbar__text">Your plan is paused — restart it to build this week&apos;s ad.</p>
                <Link className="btn btn-primary btn-lg" href="/app/settings">
                  Restart the plan
                </Link>
              </>
            ) : (
              <>
                <p className="actionbar__text">No ad written for this pick yet.</p>
                <BuildCampaignButton
                  opportunityId={top.id}
                  className="btn btn-primary btn-lg"
                  direction={null}
                >
                  Build the campaign
                </BuildCampaignButton>
              </>
            )}
          </div>

          {/* quieter: everything that is not the sweep --------------------- */}
          <details className="more">
            <summary>Ask about this pick, and the rest of the week</summary>
            <div className="more__body">
              <PickAsk
                opportunityId={top.id}
                questions={askQuestions}
                hasCampaign={Boolean(campaign)}
                rebuildable={Boolean(campaign) && campaignRebuildable(campaign!.status)}
              />
              {picks.length > 1 && (
                <form action={passOnPickAction} className="more__block passrow">
                  <input type="hidden" name="opportunity_id" value={top.id} />
                  <div>
                    <h3 className="pick__h">Not this one</h3>
                    <p className="pick__note mt-0">
                      Pass on it and TRND stops offering it this week. The next pick takes its place.
                    </p>
                  </div>
                  <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Passing…">
                    Pass on this pick
                  </SubmitButton>
                </form>
              )}
              {runnerUps.length > 0 && (
                <div className="more__block">
                  <h3 className="pick__h">Also ranked this week</h3>
                  <ul className="runnerups">
                    {runnerUps.map((o) => {
                      const s = pickSignals.get(o.id);
                      const i = picks.findIndex((p) => p.id === o.id);
                      return (
                        <li key={o.id}>
                          <Link href={i <= 0 ? "/app" : `/app?pick=${i + 1}`}>
                            {titleCase(s?.term ?? "pick")}
                          </Link>
                          <GradePill score={Number(o.score)} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {standing.length > 0 && (
                <div className="more__block">
                  <StandingQuestions
                    questions={standing}
                    suggestions={standingSuggestions}
                    modelReady={isGeminiConfigured}
                  />
                </div>
              )}
            </div>
          </details>
        </main>
      </div>
    </div>
  );
}
