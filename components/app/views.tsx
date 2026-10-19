import Link from "next/link";

import { removeRunAction } from "@/lib/actions";
import { perK, postsPerWeek, readVideo, timesNormal, type BorrowParts, type Normal, type TrendRow, type VideoRead } from "@/lib/creators/stats";
import type { Creator, FollowerSnapshot, IdeaRun, Peer, Plan, Video } from "@/lib/db/types";
import { compact, duration, shortDate, signed, withinDays } from "@/lib/format";
import { goalLabel } from "@/lib/goals";

import Avatar from "./avatar";
import { AddPeerForm } from "./forms";
import IdeaCard, { BorrowScore, IDEA_TYPE, type IdeaSource } from "./idea-card";
import { StageBar, STAGE_LABEL } from "./stage";

/** "*one tool, one result*" → the phrase in pink. The model marks at most two. */
export function Emphasis({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((part, i) => (part.startsWith("*") && part.endsWith("*") ? <em key={i}>{part.slice(1, -1)}</em> : part))}
    </>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="bg-surface px-3.5 py-3 min-w-0">
      <span className="label">{label}</span>
      <strong className="block display !font-semibold text-[clamp(16px,2.2vw,20px)] leading-tight my-1 tnum break-words">{value}</strong>
      <small className={`text-[12.5px] ${tone === "up" ? "text-pos" : tone === "down" ? "text-neg" : "text-ink-2"}`}>{hint}</small>
    </div>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px bg-line border border-line rounded-[14px] overflow-hidden">{children}</div>;
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
}: {
  creator: Creator;
  plan: Plan;
  normal: Normal;
  own: Video[];
  followers: { change: number; days: number } | null;
  runs: IdeaRun[];
  sources: IdeaSource[];
  openIdea: number;
}) {
  const month = own.filter((v) => v.posted_at && withinDays(v.posted_at, 30));
  const best = month.map((v) => ({ v, x: timesNormal(v.views, normal) })).sort((a, b) => (b.x ?? 0) - (a.x ?? 0))[0];
  const perWeek = postsPerWeek(own.slice(0, 30));
  return (
    <>
      <div className="night grid gap-2.5 p-[22px]">
        <span className="label">This week&apos;s answer</span>
        <h2 className="heading text-[clamp(18px,2.6vw,23px)]">
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
        <Tile label="Your typical video" value={compact(normal.views)} hint={normal.low !== null ? `${compact(normal.low)}–${compact(normal.high)} views, middle half` : "Not enough videos yet"} />
        <Tile label="Best this month" value={best?.x ? `${best.x}×` : "—"} hint={best?.x ? `your usual views · ${shortDate(best.v.posted_at!)}` : "No videos in 30 days"} tone={best?.x && best.x >= 2 ? "up" : undefined} />
        <Tile label="Goal" value={goalLabel(creator.goals?.goal) ?? "—"} hint={creator.goals?.target || (perWeek ? `You post ${perWeek}× a week` : "Set a target in settings")} />
      </Strip>
      {plan.body.ideas.map((idea, i) => (
        <IdeaCard
          key={i}
          idea={idea}
          rank={i + 1}
          planId={plan.id}
          source={sources[i]}
          normal={normal}
          run={runs.find((r) => r.plan_id === plan.id && r.rank === i + 1) ?? null}
          open={openIdea === i + 1}
        />
      ))}
      <p className="caption">
        From your last {own.length} videos, creators like you and your niche&apos;s hashtags, read {shortDate(plan.created_at)}. TikTok shows plays, likes, comments, shares and saves publicly; watch time and
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

const THUMBS = ["#e0245e", "#0b8fa3", "#7a5af0", "#a66206", "#16804a", "#b4322a"];

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
        title={`Your last ${shown.length} videos`}
        sub={
          <>
            Views tell you reach. <strong>Times your usual</strong> tells you which videos broke out, against your own median of {compact(normal.views)}. Saves per 1K views show what people keep to use later.
          </>
        }
      />
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
            {shown.map((v, i) => {
              const x = timesNormal(v.views, normal);
              const r = READ[readVideo(v, normal)];
              return (
                <tr key={v.id}>
                  <td>
                    <a href={v.url ?? undefined} target="_blank" rel="noreferrer" className="flex gap-2.5 items-center min-w-[240px] hover:underline">
                      <span className="w-[30px] h-[42px] rounded-[5px] shrink-0 grid place-items-center text-[10px] text-white font-bold" style={{ background: THUMBS[i % THUMBS.length] }}>
                        {duration(v.duration_s)}
                      </span>
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
                    {x ?? "—"}
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
      <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        <div className="card p-4 grid gap-2.5 content-start">
          <span className="label">Patterns in your numbers</span>
          {plan.body.patterns.length ? (
            <ul className="m-0 pl-[18px] grid gap-2 text-[14px]">
              {plan.body.patterns.map((p, i) => (
                <li key={i}>
                  <strong>{p.title}.</strong> <span className="text-ink-2">{p.detail}</span>
                  {p.videos.length > 0 && (
                    <span className="caption block">
                      Shown by:{" "}
                      {p.videos
                        .map((id) => byId.get(id))
                        .filter((v): v is Video => Boolean(v))
                        .slice(0, 3)
                        .map((v) => `"${(v.hook || v.caption || "").slice(0, 40)}"`)
                        .join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2 text-[14px]">Patterns appear once you have a few more videos.</p>
          )}
        </div>
        <div className="card p-4 grid gap-2.5 content-start">
          <span className="label">Followers</span>
          {followers.length >= 2 ? (
            <>
              <FollowerLine rows={followers} />
              <span className="caption">
                {compact(followers[0].followers)} on {shortDate(followers[0].captured_on)} → {compact(followers[followers.length - 1].followers)} on {shortDate(followers[followers.length - 1].captured_on)}
              </span>
            </>
          ) : (
            <p className="text-ink-2 text-[14px]">{compact(creator.followers)} today. TikTok doesn&apos;t show follower history, so we start counting from your first read; the line appears after the second.</p>
          )}
          <p className="so-what text-[14px]">
            Watch-through, where people swipe away and followers gained per video are private to your account.{" "}
            <Link href="/app/settings#tiktok" className="text-brand font-semibold hover:underline">
              Connecting TikTok
            </Link>{" "}
            is how those will come in.
          </p>
        </div>
      </div>
    </>
  );
}

/* -------------------------------- trends ---------------------------------- */

const ORDER = { early: 0, rising: 1, peaking: 2, fading: 3 } as const;
const STAGE_ADVICE = { early: "Early: the best time to join.", rising: "Rising: still worth joining this week.", peaking: "At its peak: join only with a strong angle of your own.", fading: "Fading: skip it." } as const;

export function TrendsView({ creator, trends, plan }: { creator: Creator; trends: TrendRow[]; plan: Plan }) {
  const shown = [...trends].sort((a, b) => ORDER[a.stage] - ORDER[b.stage] || b.recent - a.recent).slice(0, 12);
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
                <div className="flex gap-2 items-center">
                  <StageBar stage={t.stage} />
                  <span className="mono text-[12px]">{STAGE_LABEL[t.stage]}</span>
                </div>
                <p className="so-what text-[14px]">
                  {idea > 0 ? (
                    <Link href={`/app?idea=${idea}#idea-${idea}`} className="hover:underline">
                      Idea #{idea} rides it.
                    </Link>
                  ) : (
                    STAGE_ADVICE[t.stage]
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
          Trends and creators like you are found from these.{" "}
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
        title="Creators like you, and what you can borrow"
        sub="Matched by your niche hashtags and a similar size. × is how far their best recent video beat their own usual views: a video that beats its creator's normal is a format that works, not just a big account."
      />
      {cards.length ? (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
          {cards.map(({ peer, best, growth }) => (
            <Link key={peer.id} href={`/app/creators/${peer.handle}`} className="card p-3.5 grid gap-2 content-start hover:border-brand transition-colors">
              <div className="flex gap-2.5 items-center min-w-0">
                <Avatar name={peer.handle} size={36} />
                <div className="min-w-0">
                  <strong className="block break-all">@{peer.handle}</strong>
                  <span className="caption">
                    {compact(peer.followers)} followers{growth ? ` · ${signed(growth.change)} in ${growth.days}d` : ""}
                  </span>
                </div>
              </div>
              {best ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {best.times !== null && <span className={best.times >= 2 ? "pill pill-pos" : "pill"}>Best: {best.times}× their usual</span>}
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
        <div className="card p-5 text-ink-2">No creators matched yet. Add ones you watch below, or check your niche hashtags in settings.</div>
      )}
      <div className="card p-4 grid gap-2.5 max-w-[520px]">
        <span className="label">Add a creator you watch</span>
        <AddPeerForm />
      </div>
    </>
  );
}

/** One peer's videos, ranked by borrow score: the page behind a creator card. */
export function PeerVideos({ rows }: { rows: { v: Video; score: number; parts: BorrowParts; times: number | null }[] }) {
  return (
    <div className="grid gap-2.5">
      {rows.map(({ v, score, parts, times }) => (
        <div key={v.id} className="card p-3.5 grid gap-2">
          <a href={v.url ?? undefined} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
            &ldquo;{v.hook || v.caption || "Untitled"}&rdquo;
          </a>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="pill">{compact(v.views)} views</span>
            {times !== null && <span className={times >= 2 ? "pill pill-pos" : "pill"}>{times}× their usual</span>}
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

const RESULT = { beat: { label: "Beat it", cls: "pill pill-pos" }, in_range: { label: "In range", cls: "pill" }, missed: { label: "Missed", cls: "pill pill-neg" } } as const;

export function LoopView({ runs, videos }: { runs: IdeaRun[]; videos: Video[] }) {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const checked = runs.filter((r) => r.status === "checked" && r.result);
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
        <Tile label="Beat or met your usual" value={checked.length ? `${beat + inRange} of ${checked.length}` : "—"} hint={checked.length ? `${beat} beat it` : "checked 48h after posting"} tone={checked.length && beat ? "up" : undefined} />
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
