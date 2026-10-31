import Link from "next/link";

import { removeRunAction } from "@/lib/actions";
import { callable, perK, postsPerWeek, readVideo, timesNormal, trendList, type BorrowParts, type Normal, type TrendRow, type VideoRead } from "@/lib/creators/stats";
import type { Creator, FollowerSnapshot, IdeaRun, Peer, Plan, Video } from "@/lib/db/types";
import { compact, shortDate, signed, times, withinDays } from "@/lib/format";
import { goalLabel } from "@/lib/goals";

import Avatar from "./avatar";
import { AddPeerForm } from "./forms";
import IdeaCard, { BorrowScore, IDEA_TYPE, Thumb, type IdeaSource } from "./idea-card";
import LockedIdea from "./locked-idea";
import { StageBar, STAGE_LABEL } from "./stage";
import ViewsStrip from "./views-strip";

/** "*one tool, one result*" → the phrase in pink. The model marks at most two. */
export function Emphasis({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((part, i) => (part.startsWith("*") && part.endsWith("*") ? <em key={i}>{part.slice(1, -1)}</em> : part))}
    </>
  );
}

/** One stat as its own card: an oversized number (or a short word, smaller), the label above, the hint below. */
function Tile({ label, value, hint, tone, text = false, children }: { label: string; value: React.ReactNode; hint: React.ReactNode; tone?: "up" | "down"; text?: boolean; children?: React.ReactNode }) {
  return (
    <div className="card px-4 py-3.5 min-w-0">
      <span className="label">{label}</span>
      <strong className={`block my-1.5 break-words ${text ? "heading text-[clamp(16px,2vw,19px)] leading-tight" : `stat-num ${tone === "up" ? "stat-up" : ""}`}`}>{value}</strong>
      <small className={`text-[12.5px] ${tone === "up" ? "text-pos font-semibold" : tone === "down" ? "text-neg font-semibold" : "text-ink-2"}`}>{hint}</small>
      {children}
    </div>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 gap-3">{children}</div>;
}

function Heading({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div>
      <h2 className="heading text-[clamp(18px,2.6vw,23px)]">{title}</h2>
      {sub && <p className="text-ink-2 mt-1.5 max-w-[72ch]">{sub}</p>}
    </div>
  );
}

/* --------------------------------- next ----------------------------------- */

export function NextView({
  creator,
  plan,
  normal,
  own,
  followers,
  runs,
  sources,
  openIdea,
  limited = false,
}: {
  creator: Creator;
  plan: Plan;
  normal: Normal;
  own: Video[];
  followers: { change: number; days: number } | null;
  runs: IdeaRun[];
  sources: IdeaSource[];
  openIdea: number;
  /** No trial yet: idea 1 in full, the rest by their hooks. */
  limited?: boolean;
}) {
  const month = own.filter((v) => v.posted_at && withinDays(v.posted_at, 30));
  const best = month.map((v) => ({ v, x: timesNormal(v.views, normal) })).sort((a, b) => (b.x ?? 0) - (a.x ?? 0))[0];
  const perWeek = postsPerWeek(own.slice(0, 30));
  return (
    <>
      <div className="night grid gap-3 p-6 sm:p-8">
        <span className="label">This week&apos;s answer</span>
        <h2 className="heading text-[clamp(20px,3vw,28px)] leading-[1.22] max-w-[40ch]">
          <Emphasis text={plan.body.headline} />
        </h2>
        <p className="opacity-80 max-w-[70ch]">{plan.body.summary}</p>
      </div>
      <Strip>
        <Tile
          label="Followers"
          value={followers ? signed(followers.change) : compact(creator.followers)}
          hint={followers ? `over ${followers.days} days` : "Growth shows after two daily reads"}
          tone={followers ? (followers.change >= 0 ? "up" : "down") : undefined}
        />
        <Tile label="Your typical video" value={compact(normal.views)} hint={normal.low !== null ? `${compact(normal.low)}–${compact(normal.high)} views, middle half` : "Not enough videos yet"}>
          <ViewsStrip views={own.map((v) => v.views)} usual={normal.views} />
        </Tile>
        <Tile
          label="Best this month"
          value={best?.x ? times(best.x) : "—"}
          hint={best?.x ? `your usual views · ${shortDate(best.v.posted_at!)}` : month.length ? "Not enough videos to compare yet" : "No videos in 30 days"}
          tone={best?.x && best.x >= 2 ? "up" : undefined}
        />
        <Tile text label="Goal" value={goalLabel(creator.goals?.goal) ?? "—"} hint={creator.goals?.target || (perWeek ? `You post ${perWeek}× a week` : "Set a target in settings")} />
      </Strip>
      {plan.body.ideas.map((idea, i) =>
        limited && i > 0 ? (
          <LockedIdea
            key={i}
            hook={idea.hook}
            type={idea.type}
            rank={i + 1}
            cta={
              <Link href="/app/welcome?step=trial" className="btn btn-primary btn-sm shrink-0">
                Start free trial
              </Link>
            }
          />
        ) : (
        <IdeaCard
          key={i}
          idea={idea}
          rank={i + 1}
          planId={plan.id}
          source={sources[i]}
          normal={normal}
          run={runs.find((r) => r.plan_id === plan.id && r.rank === i + 1) ?? null}
          open={openIdea === i + 1}
          sample={limited}
        />
        ),
      )}
      <p className="caption">
        From your last {own.length} videos, creators ahead of you and your niche&apos;s hashtags, read {shortDate(plan.created_at)}. TikTok shows plays, likes, comments, shares and saves publicly; watch time and
        followers per video are not public, so nothing here claims them.
      </p>
    </>
  );
}

/* --------------------------------- mine ----------------------------------- */

const READ: Record<VideoRead, { label: string; cls: string }> = {
  do_more: { label: "Do more", cls: "pill pill-pos" },
  saved: { label: "Saved a lot", cls: "pill pill-cyan" },
  talked_about: { label: "Talked about", cls: "pill pill-warn" },
  below: { label: "Below your usual", cls: "pill pill-neg" },
  typical: { label: "Typical", cls: "pill" },
  too_new: { label: "Still counting", cls: "pill" },
};


/** A line of follower counts over the days we have read them. */
function FollowerLine({ rows }: { rows: FollowerSnapshot[] }) {
  if (rows.length < 2) return null;
  const xs = rows.map((r) => r.followers);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const pts = xs.map((x, i) => `${(i / (xs.length - 1)) * 300},${hi === lo ? 40 : 75 - ((x - lo) / (hi - lo)) * 70}`).join(" ");
  return (
    <svg viewBox="0 0 300 80" className="w-full h-auto" role="img" aria-label={`Followers from ${compact(xs[0])} to ${compact(xs[xs.length - 1])}`}>
      <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function MineView({ creator, own, normal, plan, followers }: { creator: Creator; own: Video[]; normal: Normal; plan: Plan; followers: FollowerSnapshot[] }) {
  const shown = own.slice(0, 30);
  const maxX = Math.max(1, ...shown.map((v) => timesNormal(v.views, normal) ?? 0));
  const byId = new Map(own.map((v) => [v.video_id, v]));
  return (
    <>
      <Heading
        title={shown.length === 1 ? "Your last video" : `Your last ${shown.length} videos`}
        sub={normal.views !== null ? <>Your usual: <strong>{compact(normal.views)} views</strong>. Pink is a breakout, twice that or more.</> : "Your usual shows once a few videos are two days old."}
      />
      {normal.views !== null && shown.length >= 2 && <ViewsChart videos={shown} usual={normal.views} />}
      <div className="card overflow-x-auto">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              <th>Video</th>
              <th className="!text-right">Views</th>
              <th>× your usual</th>
              <th className="!text-right">Comments / 1K</th>
              <th className="!text-right">Saves / 1K</th>
              <th className="!text-right">Shares / 1K</th>
              <th>Read</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => {
              const x = timesNormal(v.views, normal);
              const r = READ[readVideo(v, normal)];
              return (
                <tr key={v.id}>
                  <td>
                    <a href={v.url ?? undefined} target="_blank" rel="noreferrer" className="flex gap-2.5 items-center min-w-[240px] hover:underline">
                      <Thumb video={v} className="w-[32px] h-[44px]" />
                      <span className="min-w-0">
                        <strong className="block line-clamp-1">{v.hook || v.caption || "Untitled"}</strong>
                        <span className="caption">{v.posted_at ? shortDate(v.posted_at) : ""}{v.format ? ` · ${v.format}` : ""}</span>
                      </span>
                    </a>
                  </td>
                  <td className="text-right tnum">{compact(v.views)}</td>
                  <td className="tnum whitespace-nowrap">
                    <span className="bar w-[60px] mr-1.5">
                      <i style={{ width: `${((x ?? 0) / maxX) * 100}%` }} />
                    </span>
                    {x === null ? "—" : times(x)}
                  </td>
                  <td className="text-right tnum">{perK(v.comments, v.views) ?? "—"}</td>
                  <td className="text-right tnum">{perK(v.saves, v.views) ?? "—"}</td>
                  <td className="text-right tnum">{perK(v.shares, v.views) ?? "—"}</td>
                  <td>
                    <span className={r.cls}>{r.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <div className="grid gap-3">
          <span className="label">What your numbers say</span>
          {plan.body.patterns.length ? (
            plan.body.patterns.map((p, i) => {
              const vids = p.videos.map((id) => byId.get(id)).filter((v): v is Video => Boolean(v)).slice(0, 3);
              return (
                <div key={i} className="card p-4 flex gap-4 items-start">
                  {vids.length > 0 && (
                    <div className="flex -space-x-3 shrink-0 pt-0.5">
                      {vids.map((v) => (
                        <span key={v.id} className="relative">
                          <Thumb video={v} className="w-[44px] h-[60px] ring-2 ring-surface" />
                          {timesNormal(v.views, normal) !== null && (
                            <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 pill !h-[18px] !px-1.5 !text-[10.5px] ${(timesNormal(v.views, normal) ?? 0) >= 2 ? "pill-pos" : ""}`}>{times(timesNormal(v.views, normal)!)}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="min-w-0">
                    <strong className="block text-[15px] leading-snug">{p.title.replace(/[.\s]+$/, "")}</strong>
                    <p className="text-ink-2 text-[13.5px] mt-1 line-clamp-3">{p.detail}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="card p-4 text-ink-2 text-[14px]">Patterns show once you have a few more videos.</p>
          )}
        </div>
        <div className="card p-4 grid gap-2 content-start">
          <span className="label">Followers</span>
          <span className="stat-num">{compact(creator.followers)}</span>
          {followers.length >= 2 ? (
            <>
              <FollowerLine rows={followers} />
              <span className="caption">
                {shortDate(followers[0].captured_on)} → {shortDate(followers[followers.length - 1].captured_on)}
              </span>
            </>
          ) : (
            <span className="caption">The line starts after tomorrow&apos;s read.</span>
          )}
        </div>
      </div>
    </>
  );
}

/** Views per video, oldest left, on a square-root scale, with the creator's usual as a dashed line; breakouts in pink. */
function ViewsChart({ videos, usual }: { videos: Video[]; usual: number }) {
  const vs = [...videos].filter((v) => v.views !== null).reverse();
  const top = Math.sqrt(Math.max(usual * 2, ...vs.map((v) => v.views ?? 0)));
  const h = (n: number) => `${Math.max(3, (Math.sqrt(n) / top) * 100)}%`;
  return (
    <div className="card p-4 pb-3 grid gap-2">
      <div className="relative h-[120px] flex items-end justify-evenly gap-[3px]">
        <span className="absolute inset-x-0 border-t border-dashed border-ink-3/60" style={{ bottom: h(usual) }}>
          <span className="absolute right-0 -top-5 caption bg-surface px-1">usual {compact(usual)}</span>
        </span>
        {vs.map((v) => {
          const x = timesNormal(v.views, { views: usual }) ?? 0;
          return (
            <a
              key={v.id}
              href={v.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              title={`${compact(v.views)} views · ${times(x)} your usual${v.posted_at ? ` · ${shortDate(v.posted_at)}` : ""}`}
              className={`flex-1 min-w-[4px] max-w-[48px] rounded-t-[5px] transition-opacity hover:opacity-80 ${x >= 2 ? "bg-[linear-gradient(180deg,var(--hot),var(--brand))]" : x <= 0.5 ? "bg-line-strong" : "bg-[color-mix(in_srgb,var(--cyan)_45%,var(--line))]"}`}
              style={{ height: h(v.views ?? 0) }}
            />
          );
        })}
      </div>
      <div className="flex justify-between caption">
        <span>{vs[0]?.posted_at ? shortDate(vs[0].posted_at) : ""}</span>
        <span>{vs[vs.length - 1]?.posted_at ? shortDate(vs[vs.length - 1].posted_at!) : ""}</span>
      </div>
    </div>
  );
}

/* -------------------------------- trends ---------------------------------- */

const ORDER = { early: 0, rising: 1, peaking: 2, fading: 3 } as const;
const STAGE_ADVICE = { early: "Early: the best time to join.", rising: "Rising: still worth joining this week.", peaking: "At its peak: join only with a strong angle of your own.", fading: "Fading: skip it." } as const;

export function TrendsView({ creator, trends, plan }: { creator: Creator; trends: TrendRow[]; plan: Plan }) {
  const shown = trendList([...trends].sort((a, b) => ORDER[a.stage] - ORDER[b.stage] || b.recent - a.recent)).slice(0, 12);
  const usedBy = (key: string) => plan.body.ideas.findIndex((i) => i.source_trend === key) + 1;
  return (
    <>
      <Heading
        title="Trending where you post"
        sub="Hashtags and sounds in the videos we read from your niche over the last 14 days: this week against the week before. Early is the best time to join; fading means skip."
      />
      {shown.length ? (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
          {shown.map((t) => {
            const idea = usedBy(t.key);
            return (
              <div key={`${t.kind}:${t.key}`} className="card p-4 grid gap-2.5 content-start">
                <div className="flex justify-between gap-2">
                  <span className={t.kind === "sound" ? "pill pill-cyan" : "pill"}>{t.kind === "sound" ? "Sound" : "Hashtag"}</span>
                  {idea > 0 && <span className="pill pill-brand">Idea #{idea}</span>}
                </div>
                <h3 className={`text-[16px] font-bold break-words ${t.kind === "hashtag" ? "mono !font-medium" : ""}`}>{t.label}</h3>
                <p className="caption">
                  {t.recent} videos this week · {t.prior} last week · {t.creators} creators
                </p>
                {callable(t) ? (
                  <div className="flex gap-2 items-center">
                    <StageBar stage={t.stage} />
                    <span className="mono text-[12px]">{STAGE_LABEL[t.stage]}</span>
                  </div>
                ) : (
                  <span className="caption">Too few videos to call</span>
                )}
                <p className="so-what text-[14px]">
                  {idea > 0 ? (
                    <Link href={`/app?idea=${idea}#idea-${idea}`} className="hover:underline">
                      Idea #{idea} rides it.
                    </Link>
                  ) : callable(t) ? (
                    STAGE_ADVICE[t.stage]
                  ) : (
                    "Watch it: not enough videos yet to say where it's going."
                  )}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-5 text-ink-2">Nothing is being used by two or more creators in your niche yet. Trends show up as more videos are read.</div>
      )}
      <div className="card p-4 grid gap-2.5">
        <span className="label">The hashtags we watch for you</span>
        <div className="flex flex-wrap gap-1.5">
          {creator.hashtags.map((t) => (
            <span key={t} className="chip chip-tag">
              #{t}
            </span>
          ))}
        </div>
        <p className="caption">
          Trends and creators ahead of you are found from these.{" "}
          <Link href="/app/settings#hashtags" className="text-brand hover:underline">
            Change them
          </Link>
        </p>
      </div>
    </>
  );
}

/* ------------------------------- creators --------------------------------- */

export interface PeerCard {
  peer: Peer;
  normal: Normal;
  best: { v: Video; score: number; parts: BorrowParts; times: number | null } | null;
  growth: { change: number; days: number } | null;
}

export function CreatorsView({ cards }: { cards: PeerCard[] }) {
  return (
    <>
      <Heading
        title="Creators ahead of you, and what you can borrow"
        sub="Creators in your niche a step or two bigger than you, the accounts to grow into, plus anyone you add. × is how far their best recent video beat their own usual views: a video that beats its creator's normal is a format that works, not just a big account."
      />
      {cards.length ? (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
          {cards.map(({ peer, best, growth }) => (
            <Link key={peer.id} href={`/app/creators/${peer.handle}`} className="card p-3.5 grid gap-2 content-start hover:border-brand transition-colors">
              <div className="flex gap-2.5 items-center min-w-0">
                <Avatar name={peer.handle} size={36} ring={peer.source === "match"} />
                <div className="min-w-0">
                  <strong className="block break-all">@{peer.handle}</strong>
                  <span className="caption">
                    {peer.followers === null ? "Not read yet" : `${compact(peer.followers)} followers`}
                    {growth ? ` · ${signed(growth.change)} in ${growth.days}d` : ""}
                  </span>
                </div>
              </div>
              {best ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {best.times !== null && <span className={best.times >= 2 ? "pill pill-pos" : "pill"}>Best: {times(best.times)} their usual</span>}
                    <span className={best.score >= 70 ? "pill pill-brand" : "pill"}>Borrow score {best.score}</span>
                  </div>
                  <p className="text-[14px] font-semibold line-clamp-2">{best.v.format ? `${best.v.format[0].toUpperCase()}${best.v.format.slice(1)}: ` : ""}&ldquo;{best.v.hook || best.v.caption}&rdquo;</p>
                </>
              ) : (
                <p className="caption">{peer.last_error ?? (peer.last_read_at ? "No videos in the last three weeks." : "Read on the next scan.")}</p>
              )}
              <span className="caption">{peer.source === "owner" ? "Added by you" : peer.reason} · View →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card p-5 text-ink-2">No creators matched yet. Add ones you want to be like below, or check your niche hashtags in settings.</div>
      )}
      <div className="card p-4 grid gap-2.5 max-w-[520px]">
        <span className="label">Add a creator you want to be like</span>
        <AddPeerForm />
      </div>
    </>
  );
}

/** One peer's videos, ranked by borrow score: the page behind a creator card. */
export function PeerVideos({ rows }: { rows: { v: Video; score: number; parts: BorrowParts; times: number | null }[] }) {
  return (
    <div className="grid gap-2.5">
      {rows.map(({ v, score, parts, times: x }) => (
        <div key={v.id} className="card p-3.5 grid gap-2">
          <a href={v.url ?? undefined} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
            &ldquo;{v.hook || v.caption || "Untitled"}&rdquo;
          </a>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="pill">{compact(v.views)} views</span>
            {x !== null && <span className={x >= 2 ? "pill pill-pos" : "pill"}>{times(x)} their usual</span>}
            {v.format && <span className="pill">{v.format}</span>}
            <BorrowScore score={score} parts={parts} />
            {v.posted_at && <span className="caption">{shortDate(v.posted_at)}</span>}
          </div>
          {v.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {v.hashtags.slice(0, 6).map((t) => (
                <span key={t} className="chip chip-tag !text-[11px] !py-0">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- loop ----------------------------------- */

const RESULT = {
  beat: { label: "Beat it", cls: "pill pill-pos" },
  in_range: { label: "In range", cls: "pill" },
  missed: { label: "Missed", cls: "pill pill-neg" },
  unknown: { label: "No numbers", cls: "pill" },
} as const;

export function LoopView({ runs, videos }: { runs: IdeaRun[]; videos: Video[] }) {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const checked = runs.filter((r) => r.status === "checked" && r.result);
  const judged = checked.filter((r) => r.result!.read !== "unknown");
  const beat = checked.filter((r) => r.result!.read === "beat").length;
  const inRange = checked.filter((r) => r.result!.read === "in_range").length;
  return (
    <>
      <Heading
        title="Did the ideas work?"
        sub="Every idea you add to your week is measured against your typical video. When you post it we find it by its words, and 48 hours later we check its views. That's how you know whether the advice is any good."
      />
      <Strip>
        <Tile label="Ideas added" value={runs.length} hint="from your plans" />
        <Tile label="Posted" value={runs.filter((r) => r.status !== "planned").length} hint="matched to your videos" />
        <Tile label="Beat or met your usual" value={judged.length ? `${beat + inRange} of ${judged.length}` : "—"} hint={judged.length ? `${beat} beat it` : "checked 48h after posting"} tone={judged.length && beat ? "up" : undefined} />
      </Strip>
      {runs.length ? (
        <div className="card px-4 divide-y divide-line">
          {runs.map((r) => {
            const v = r.video_id ? byId.get(r.video_id) : null;
            return (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-center py-3 text-[14px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    <span className={IDEA_TYPE[r.idea.type].cls}>{IDEA_TYPE[r.idea.type].label}</span>
                    <span className="caption self-center">added {shortDate(r.added_at)}</span>
                  </div>
                  <strong className="block">{r.idea.hook}</strong>
                  <span className="caption">
                    {r.expected ? `Your usual then: ${compact(r.expected.low)}–${compact(r.expected.high)} views` : "No usual range yet"}
                    {v ? ` · posted ${v.posted_at ? shortDate(v.posted_at) : ""}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  {r.status === "checked" && r.result ? (
                    <>
                      <span className="mono tnum text-[13px]">{compact(r.result.views)} views</span>
                      <span className={RESULT[r.result.read].cls}>{RESULT[r.result.read].label}</span>
                    </>
                  ) : r.status === "posted" ? (
                    <span className="pill pill-cyan">Checking at 48h</span>
                  ) : (
                    <form action={removeRunAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <span className="caption mr-2 max-[560px]:hidden">Not posted yet</span>
                      <button className="btn btn-ghost btn-sm" type="submit">
                        Remove
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-5 text-ink-2">
          Nothing to check yet. Open an idea under{" "}
          <Link href="/app" className="text-brand font-semibold hover:underline">
            Post next
          </Link>
          , add it to your week, and post it. It shows up here on the next read.
        </div>
      )}
    </>
  );
}
