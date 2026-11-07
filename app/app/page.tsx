import Link from "next/link";
import { redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import CopyText from "@/components/app/copy-text";
import DiagnosisCard from "@/components/app/diagnosis-card";
import Locked from "@/components/app/locked";
import SubmitButton from "@/components/app/submit-button";
import { CreatorsView, LoopView, MineView, NextView, type PeerCard } from "@/components/app/views";
import { scanNowAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { logEvent } from "@/lib/events";
import { referralCode, referralUrl } from "@/lib/referrals";
import { planState, yearlyPerMonth } from "@/lib/billing";
import { diagnose } from "@/lib/creators/diagnosis";
import { dollarRange, gapOf, postsPerMonth } from "@/lib/creators/gap";
import { normalizeFormat } from "@/lib/creators/formats";
import { baseHitRate, borrowScore, followerChange, formatCallable, formatRows, normalOf, timesNormal, trendRows } from "@/lib/creators/stats";
import { getCreator, listFollowers, listOwnVideos, listPeers, listPlans, listRuns, listVideos } from "@/lib/data";
import type { ScanStage } from "@/lib/db/types";
import { ago, compact, daysSince, isScanning, withinDays } from "@/lib/format";

export const metadata = { title: "Your plan — TRND for creators" };
// "Scan now" runs the scan after the response, inside this route's time limit.
export const maxDuration = 300;

const TABS = [
  { key: "next", label: "Post next", short: "Next" },
  { key: "mine", label: "Your videos", short: "Videos" },
  { key: "creators", label: "Creators ahead of you", short: "Creators" },
  { key: "loop", label: "Did it work?", short: "Results" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const STAGE_LINE: Record<ScanStage, string> = {
  profile: "Reading your videos.",
  niche: "Reading your niche's hashtags.",
  peers: "Reading creators ahead of you.",
  trends: "Scanning what's rising.",
  tag: "Reading your new videos.",
  plan: "Checking your ideas.",
};

export default async function PlanPage({ searchParams }: PageProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  if (!creator) redirect("/app/setup");
  const { tab: tabParam, idea: ideaParam, scan: scanFlag, from: fromParam } = await searchParams;
  const from = typeof fromParam === "string" ? fromParam : null;

  const [plans, own, peers, recent, runs, followers] = await Promise.all([
    listPlans(creator.id, 6),
    listOwnVideos(creator.id),
    listPeers(creator.id),
    listVideos(creator.id, { days: 14 }),
    listRuns(creator.id),
    listFollowers(creator.id, 60),
  ]);
  const peerVideos = await listVideos(creator.id, { days: 90, authors: peers.map((p) => p.handle) });
  const videos = [...own, ...peerVideos];
  const [latest] = plans;
  if (!latest) redirect("/app/setup");
  if (!creator.goals) redirect("/app/setup");

  const plan = planState(creator);
  const limited = plan.locked;
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "next";
  const running = isScanning(creator);


  // The numbers every view leans on, computed once.
  const normal = normalOf(own);
  const peerSet = new Set(peers.map((p) => p.handle));
  const picked = new Set(peers.filter((p) => p.source === "owner").map((p) => p.handle));
  const byAuthor = new Map<string, typeof videos>();
  for (const v of videos) byAuthor.set(v.author, [...(byAuthor.get(v.author) ?? []), v]);
  const normals = new Map([...byAuthor].map(([h, vs]) => [h, normalOf(vs)]));
  const trends = trendRows(recent);
  // Formats across the creators ahead, each video against its own creator's usual: only ones with enough behind them.
  const formats = formatRows(videos, normals).filter(formatCallable);
  const formatBase = baseHitRate(peerVideos, normals);
  const myFollowers = followerChange(followers.filter((f) => f.handle === creator.handle));

  const peerCards: PeerCard[] = peers.map((p) => {
    const theirs = (byAuthor.get(p.handle) ?? []).filter((v) => v.posted_at && withinDays(v.posted_at, 21));
    const n = normals.get(p.handle) ?? normalOf([]);
    const best = theirs
      .map((v) => ({ v, ...borrowScore(v, n, creator.hashtags, { chosen: picked.has(p.handle) }) }))
      .sort((a, b) => b.score - a.score)[0];
    return { peer: p, normal: n, best: best ?? null, growth: followerChange(followers.filter((f) => f.handle === p.handle)) };
  });
  // The creators the owner picked come first, then the most worth borrowing from; nothing recent goes last.
  peerCards.sort((a, b) => Number(picked.has(b.peer.handle)) - Number(picked.has(a.peer.handle)) || (b.best?.score ?? -1) - (a.best?.score ?? -1));

  // A trend is shown through the video doing best on it this week, against its own creator's usual: the proof, not a count.
  const bestOnTrend = (key: string) => {
    const k = key.replace(/^#/, "").toLowerCase();
    const on = recent.filter((v) => v.posted_at && withinDays(v.posted_at, 7) && (v.hashtags.some((h) => h.replace(/^#/, "").toLowerCase() === k) || v.sound?.toLowerCase() === k));
    return on.map((v) => ({ v, x: timesNormal(v.views, normals.get(v.author) ?? normalOf([])) ?? 0 })).sort((a, b) => b.x - a.x || (b.v.views ?? 0) - (a.v.views ?? 0))[0]?.v ?? null;
  };
  const ideaSource = (i: (typeof latest.body.ideas)[number]) => {
    const video = i.source_video ? (videos.find((v) => v.video_id === i.source_video) ?? null) : i.source_trend ? bestOnTrend(i.source_trend) : null;
    const n = video ? (normals.get(video.author) ?? normalOf([])) : null;
    const isOwn = Boolean(video?.is_self);
    return {
      video,
      own: isOwn,
      times: video && n ? timesNormal(video.views, n) : null,
      borrow: video && n && !isOwn && peerSet.has(video.author) ? borrowScore(video, n, creator.hashtags, { chosen: picked.has(video.author) }) : null,
      trend: i.source_trend ? (trends.find((t) => t.key === i.source_trend) ?? null) : null,
      formatBase,
      // The format the plan named, or for an older borrow idea the format of the video it builds on.
      format: i.type === "borrow" ? (formats.find((f) => f.format === (normalizeFormat(i.source_format) ?? (isOwn ? null : normalizeFormat(video?.format)))) ?? null) : null,
    };
  };
  const openIdea = Number(ideaParam) || 1;
  // Null until migration 0006 adds the referral columns: the share block waits for it.
  const referral = await referralCode(creator)
    .then(referralUrl)
    .catch(() => null);
  // The retention metrics read these: which plan was opened, how many days into the account, and a scorecard opened.
  const ageDays = daysSince(creator.created_at);
  if (tab === "next") await logEvent("plan_viewed", { creatorId: creator.id, meta: { plan: latest.id, age_days: ageDays, free: limited } });
  if (tab === "loop" || from === "scorecard") await logEvent("scorecard_opened", { creatorId: creator.id, meta: { age_days: ageDays, from: from ?? "tab" } });
  // The gap, shown on Free with the upgrade directly under it.
  // The diagnosis: what's wrong with their videos. Free sees that it's wrong and how much; Creator sees what it is.
  const gap = gapOf(
    { followers: creator.followers, typical: normal.views },
    peers.map((p) => ({ followers: p.followers, typical: normals.get(p.handle)?.views ?? null })),
    postsPerMonth(own.map((v) => v.posted_at), creator.goals?.posts_per_week),
  );
  const diagnosis = diagnose(own, normal);
  const problems = latest.body.problems ?? [];

  return (
    <div className="grid gap-5">
      {running && <AutoRefresh />}
      {diagnosis ? (
        <section className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-6 items-start" aria-label="What's wrong with your videos">
          <DiagnosisCard
            handle={creator.handle}
            followers={creator.followers}
            d={diagnosis}
            gap={gap}
            killer={limited ? null : latest.body.killer}
            fix={limited ? null : (latest.body.ideas[0]?.hook ?? null)}
            locked={limited}
          />
          {limited ? (
            <div className="grid gap-3">
              <div>
                <p className="text-[13.5px] font-semibold text-neg m-0">What&apos;s wrong with your videos</p>
                <h2 className="display text-[clamp(22px,3vw,28px)] mt-1.5">
                  {diagnosis.stuck} of your last {diagnosis.n} videos didn&apos;t break out. We know why.
                </h2>
                {gap?.dollars && (
                  <p className="text-[15px] text-ink-2 mt-2 mb-0">
                    At Creator Rewards rates, the gap to the creators ahead of you is roughly <b className="text-ink tnum">{dollarRange(gap.dollars)}</b>.
                  </p>
                )}
              </div>
              <Locked title="What's killing your posts" detail="1 line" lines={1} />
              <Locked title="Why your videos flop" detail={`${Math.max(2, problems.length)} problems`} />
              <Locked title="What the creators ahead of you do that you don't" detail={`${peers.length} creators`} />
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <Link className="btn btn-primary btn-lg" href="/app/welcome?step=trial">
                  {plan.canTrial ? "Start free trial" : "See what's wrong"}
                </Link>
                <span className="caption">Creator: the whole diagnosis and three scripts a week, from {yearlyPerMonth("creator")}/month billed yearly.</span>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-[13.5px] font-semibold text-neg m-0">What&apos;s wrong with your videos</p>
              {(problems.length ? problems : latest.body.patterns).map((x, i) => (
                <div key={x.title} className="card p-5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="mono text-[12.5px] text-ink-3">{i + 1}</span>
                    <div className="font-bold text-[16px]">{x.title}</div>
                  </div>
                  <p className="text-[14.5px] text-ink-2 leading-[1.55] mt-1.5 mb-0">{x.detail}</p>
                </div>
              ))}
              <p className="caption m-0">This week&apos;s three scripts fix these. Each one is checked 48 hours after you post it.</p>
            </div>
          )}
        </section>
      ) : (
        limited && (
          <div className="rounded-[14px] border border-brand/30 bg-brand-soft px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[14.5px]">You&apos;re on Free: one scripted idea a week. Creator shows you what&apos;s wrong with your videos and gives you three scripts a week.</span>
            <Link className="btn btn-primary btn-sm" href="/app/welcome?step=trial">
              {plan.canTrial ? "Start free trial" : "See what's wrong"}
            </Link>
          </div>
        )
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="label">
          @{creator.handle} · {compact(creator.followers)} followers · updated {ago(creator.last_scan_at)}
        </span>
        {!limited && (
          <form action={scanNowAction}>
            <SubmitButton className="btn btn-sm" pending="Starting…">
              {running ? (
                <>
                  <span className="spinner !w-3 !h-3" /> Reading
                </>
              ) : (
                "Read again now"
              )}
            </SubmitButton>
          </form>
        )}
      </div>
      {running && (
        <div className="card px-4 py-3 flex items-center gap-3 text-[14px]">
          <span className="spinner" />
          {STAGE_LINE[creator.scan_stage ?? "profile"]} {creator.plan_requested ? "A new plan lands in a few minutes" : "Your numbers update in a few minutes"}; this page updates on its own.
        </div>
      )}
      {scanFlag === "recent" && !running && <div className="card px-4 py-3 text-[14px] text-ink-2">Read {ago(creator.last_scan_at)}. The next read can start ten minutes after the last.</div>}
      {scanFlag === "daily" && !running && <div className="card px-4 py-3 text-[14px] text-ink-2">You got a new plan in the last day. You can ask for another tomorrow; your numbers still update every morning.</div>}
      {creator.scan_status === "error" && creator.scan_error &&<div className="rounded-xl border border-neg/30 bg-neg-bg px-4 py-3 text-[14px] text-neg">The last read ran into a problem: {creator.scan_error}</div>}

      <nav className="tabs" aria-label="Views">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "next" ? "/app" : `/app?tab=${t.key}`} className="tab" aria-current={tab === t.key ? "page" : undefined}>
            <span className="max-[640px]:hidden">{t.label}</span>
            <span className="min-[641px]:hidden">{t.short}</span>
            {t.key === "next" && <span className="count">{latest.body.ideas.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "next" && (
        <NextView
          creator={creator}
          plan={latest}
          normal={normal}
          own={own}
          followers={myFollowers}
          runs={runs}
          sources={latest.body.ideas.map(ideaSource)}
          openIdea={openIdea}
          limited={limited}
        />
      )}
      {tab === "next" && referral && (
        // Every weekly plan ends with the card to share and the referral link: one free month for both.
        <section className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4" aria-label="Share your week">
          <div className="min-w-0">
            <div className="font-bold">Share your next 3 posts</div>
            <p className="text-[14px] text-ink-2 mt-1 m-0">
              Post the card or send your link. When a friend subscribes through it, you both get a free month.
            </p>
            <p className="mono text-[13px] text-ink-3 mt-1.5 m-0 break-all">{referral.replace(/^https?:\/\//, "")}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <a href="/app/plan-card" className="btn btn-primary btn-sm">
              Save the card
            </a>
            <CopyText text={referral} label="Copy my link" className="btn btn-sm" />
          </div>
        </section>
      )}
      {tab === "mine" && <MineView creator={creator} own={own} normal={normal} plan={latest} followers={followers.filter((f) => f.handle === creator.handle)} />}
      {tab === "creators" && <CreatorsView cards={peerCards} />}
      {tab === "loop" && <LoopView runs={runs} videos={videos} normal={normal} nextHook={latest.body.ideas[0]?.hook ?? null} />}
    </div>
  );
}
