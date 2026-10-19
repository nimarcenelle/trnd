import Link from "next/link";
import { redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import SubmitButton from "@/components/app/submit-button";
import { CreatorsView, LoopView, MineView, NextView, TrendsView, type PeerCard } from "@/components/app/views";
import { scanNowAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { borrowScore, followerChange, normalOf, timesNormal, trendRows } from "@/lib/creators/stats";
import { getCreator, listFollowers, listPeers, listPlans, listRuns, listVideos } from "@/lib/data";
import { ago, compact, isScanning, withinDays } from "@/lib/format";

export const metadata = { title: "Your plan — TRND for creators" };
// "Scan now" runs the scan after the response, inside this route's time limit.
export const maxDuration = 300;

const TABS = [
  { key: "next", label: "Post next" },
  { key: "mine", label: "Your videos" },
  { key: "trends", label: "Trending" },
  { key: "creators", label: "Creators like you" },
  { key: "loop", label: "Did it work?" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const STAGE_LINE = { profile: "Reading your videos.", peers: "Reading creators like you.", trends: "Scanning your niche.", plan: "Writing your plan." } as const;

export default async function PlanPage({ searchParams }: PageProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  if (!creator) redirect("/app/setup");
  const { tab: tabParam, idea: ideaParam, scan: scanFlag } = await searchParams;

  const [plans, videos, peers, runs, followers] = await Promise.all([
    listPlans(creator.id, 6),
    listVideos(creator.id, { days: 120 }),
    listPeers(creator.id),
    listRuns(creator.id),
    listFollowers(creator.id, 60),
  ]);
  const [latest] = plans;
  if (!latest) redirect("/app/setup");
  if (!creator.goals) redirect("/app/setup");

  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "next";
  const running = isScanning(creator);
  const locked = planState(creator).locked;

  // The numbers every view leans on, computed once.
  const own = videos.filter((v) => v.is_self);
  const normal = normalOf(own);
  const peerSet = new Set(peers.map((p) => p.handle));
  const byAuthor = new Map<string, typeof videos>();
  for (const v of videos) byAuthor.set(v.author, [...(byAuthor.get(v.author) ?? []), v]);
  const normals = new Map([...byAuthor].map(([h, vs]) => [h, normalOf(vs)]));
  const recent = videos.filter((v) => v.posted_at && withinDays(v.posted_at, 14));
  const trends = trendRows(recent);
  const myFollowers = followerChange(followers.filter((f) => f.handle === creator.handle));

  const peerCards: PeerCard[] = peers.map((p) => {
    const theirs = (byAuthor.get(p.handle) ?? []).filter((v) => v.posted_at && withinDays(v.posted_at, 21));
    const n = normals.get(p.handle) ?? normalOf([]);
    const best = theirs
      .map((v) => ({ v, ...borrowScore(v, n, creator.hashtags) }))
      .sort((a, b) => b.score - a.score)[0];
    return { peer: p, normal: n, best: best ?? null, growth: followerChange(followers.filter((f) => f.handle === p.handle)) };
  });

  const ideaSource = (i: (typeof latest.body.ideas)[number]) => {
    const video = i.source_video ? (videos.find((v) => v.video_id === i.source_video) ?? null) : null;
    const n = video ? (normals.get(video.author) ?? normalOf([])) : null;
    const isOwn = Boolean(video?.is_self);
    return {
      video,
      own: isOwn,
      times: video && n ? timesNormal(video.views, n) : null,
      borrow: video && n && !isOwn && peerSet.has(video.author) ? borrowScore(video, n, creator.hashtags) : null,
      trend: i.source_trend ? (trends.find((t) => t.key === i.source_trend) ?? null) : null,
    };
  };
  const openIdea = Number(ideaParam) || 1;

  return (
    <div className="grid gap-5">
      {running && <AutoRefresh />}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="label">
          @{creator.handle} · {compact(creator.followers)} followers · updated {ago(creator.last_scan_at)}
        </span>
        {!locked && (
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
          {STAGE_LINE[creator.scan_stage ?? "profile"]} A new plan lands in a couple of minutes; this page updates on its own.
        </div>
      )}
      {scanFlag === "recent" && !running && <div className="card px-4 py-3 text-[14px] text-ink-2">Read {ago(creator.last_scan_at)}. The next read can start ten minutes after the last.</div>}
      {creator.scan_status === "error" && creator.scan_error && <div className="rounded-xl border border-neg/30 bg-neg-bg px-4 py-3 text-[14px] text-neg">The last read ran into a problem: {creator.scan_error}</div>}

      <nav className="tabs" aria-label="Views">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "next" ? "/app" : `/app?tab=${t.key}`} className="tab" aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
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
        />
      )}
      {tab === "mine" && <MineView creator={creator} own={own} normal={normal} plan={latest} followers={followers.filter((f) => f.handle === creator.handle)} />}
      {tab === "trends" && <TrendsView creator={creator} trends={trends} plan={latest} />}
      {tab === "creators" && <CreatorsView cards={peerCards} />}
      {tab === "loop" && <LoopView runs={runs} videos={videos} />}
    </div>
  );
}
