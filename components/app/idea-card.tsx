import { IconCalendar, IconCheck, IconClock, IconFilm, IconMusic, IconTarget } from "@/components/icons";
import { addToWeekAction } from "@/lib/actions";
import { BORROW_WEIGHTS, type BorrowParts, type Normal, type TrendRow } from "@/lib/creators/stats";
import type { Idea, IdeaRun, IdeaType, Video } from "@/lib/db/types";
import { compact, times } from "@/lib/format";

import Avatar from "./avatar";
import CopyText from "./copy-text";
import ScriptTimeline from "./script-timeline";
import { StageBar, STAGE_LABEL } from "./stage";
import SubmitButton from "./submit-button";

export const IDEA_TYPE: Record<IdeaType, { label: string; cls: string; tint: string }> = {
  double_down: { label: "Double down on you", cls: "pill pill-pos", tint: "var(--pos)" },
  borrow: { label: "Borrow a format", cls: "pill pill-brand", tint: "var(--brand)" },
  ride: { label: "Ride a trend early", cls: "pill pill-cyan", tint: "var(--cyan)" },
};

const PART_LABEL: Record<keyof BorrowParts, string> = { beat: "Beat their normal", fit: "Fits your niche", fresh: "Still fresh", saved: "Saved a lot" };

/** The borrow score as a pill that opens into what it is made of. */
export function BorrowScore({ score, parts }: { score: number; parts: BorrowParts }) {
  return (
    <details data-popover className="relative inline-block group">
      <summary className="pill pill-brand border border-brand">Borrow score {score} ⓘ</summary>
      <div className="absolute z-20 top-[calc(100%+6px)] left-0 w-[min(310px,80vw)] card p-3 shadow-[var(--shadow-lg)] text-[13px] grid gap-2">
        <strong>Is it worth borrowing for you?</strong>
        <span className="text-ink-2">0–100, from public numbers only. High means it beat its creator&apos;s usual views, it is in your niche, and it is fresh enough that copying it won&apos;t look late.</span>
        {(Object.keys(PART_LABEL) as (keyof BorrowParts)[]).map((k) => (
          <div key={k} className="grid grid-cols-[110px_1fr_28px] gap-2 items-center text-[12px]">
            <span>{PART_LABEL[k]}</span>
            <span className="bar w-full">
              <i style={{ width: `${Math.round(parts[k] * 100)}%` }} />
            </span>
            <span className="mono text-right">{Math.round(parts[k] * 100)}</span>
          </div>
        ))}
        <span className="caption">
          Weights: {(Object.keys(BORROW_WEIGHTS) as (keyof BorrowParts)[]).map((k) => `${PART_LABEL[k].toLowerCase()} ${Math.round(BORROW_WEIGHTS[k] * 100)}%`).join(", ")}.{" "}
          {score >= 85 ? "85+: make it this week." : score >= 70 ? "70–84: worth a test." : score >= 50 ? "50–69: watch it." : "Under 50: skip it."}
        </span>
      </div>
    </details>
  );
}

/** The idea as text, for notes or a shoot list. */
export function scriptText(i: Idea): string {
  return [
    i.hook,
    "",
    ...i.script.map((b) => `${b.t}  ${b.say}\n      ${b.shot}`),
    "",
    `Length: ${i.length}`,
    `Sound: ${i.sound}`,
    `Post: ${i.post_time}`,
    `Format: ${i.format}`,
    "",
    `Caption: ${i.caption}`,
    i.hashtags.join(" "),
  ].join("\n");
}

export interface IdeaSource {
  video: Video | null;
  times: number | null;
  borrow: { score: number; parts: BorrowParts } | null;
  trend: TrendRow | null;
  own: boolean;
}

/**
 * One idea, ranked. Closed: the hook and why now. Open: the script second by
 * second, the spec, caption and hashtags on the left; what it rests on, why it
 * works and how to make it yours on the right.
 */
export default function IdeaCard({
  idea,
  rank,
  planId,
  source,
  normal,
  run,
  open,
  sample = false,
}: {
  idea: Idea;
  rank: number;
  planId: string;
  source: IdeaSource;
  normal: Normal;
  run: IdeaRun | null;
  open: boolean;
  /** The landing page's example: no "Add to my week". */
  sample?: boolean;
}) {
  const t = IDEA_TYPE[idea.type];
  const from = source.own ? "Your own video" : source.video ? `@${source.video.author}` : source.trend ? `Trending in your niche` : null;
  return (
    <details id={`idea-${rank}`} open={open} className="card !rounded-[20px] overflow-hidden group scroll-mt-20" style={{ "--tint": t.tint } as React.CSSProperties}>
      <summary className="idea-head grid grid-cols-[auto_minmax(0,1fr)_auto] max-[560px]:grid-cols-[minmax(0,1fr)_auto] gap-3.5 items-start p-[18px] hover:bg-subtle/60">
        <span className="rank-badge max-[560px]:hidden">{rank}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            <span className={t.cls}>{t.label}</span>
            {from && <span className="pill">{from}</span>}
            {run && <span className="pill pill-pos">In your week</span>}
          </div>
          <p className="heading text-[clamp(18px,2.6vw,23px)] leading-[1.22]">{idea.hook}</p>
          <p className="text-ink-2 text-[14px] mt-1.5 max-w-[68ch] line-clamp-2">{idea.so}</p>
          <Evidence source={source} normal={normal} />
        </div>
        <span className="text-[20px] text-ink-3 w-5 h-7 grid place-items-center" aria-hidden>
          <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>

      <div className="border-t border-line grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="p-[18px] grid gap-3.5 content-start min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h4 className="label">The script</h4>
            <span className="caption">{idea.script.length} beats</span>
          </div>
          <ScriptTimeline beats={idea.script} />
          <ol className="m-0 p-0 list-none grid gap-2">
            {idea.script.map((b, i) => (
              <li key={i} className="grid grid-cols-[64px_minmax(0,1fr)] max-[560px]:grid-cols-[54px_minmax(0,1fr)] gap-3 items-start">
                <span className={`mono text-[11.5px] font-medium rounded-full text-center py-1 ${i === 0 ? "bg-brand text-on-brand" : "bg-muted text-ink-2"}`}>{b.t}</span>
                <div>
                  <div className="font-semibold leading-snug">{b.say}</div>
                  <div className="text-[13px] text-ink-3 mt-0.5">{b.shot}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {(
              [
                [IconClock, "Length", idea.length],
                [IconMusic, "Sound", idea.sound],
                [IconCalendar, "Post", idea.post_time],
                [IconFilm, "Format", idea.format],
              ] as const
            ).map(([Icon, k, v]) => (
              <div key={k} className="well px-3 py-2.5 flex gap-2.5 items-start min-w-0">
                <Icon className="text-brand mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="label !text-[11.5px]">{k}</div>
                  <SpecValue text={v} />
                </div>
              </div>
            ))}
          </div>
          <div className="well px-3.5 py-3 grid gap-2">
            <p className="text-[14px]">{idea.caption}</p>
            <div className="flex flex-wrap gap-1.5">
              {idea.hashtags.map((h) => (
                <span key={h} className="chip chip-tag">
                  {h.startsWith("#") ? h : `#${h}`}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="p-[18px] grid gap-3.5 content-start min-w-0 border-t md:border-t-0 md:border-l border-line">
          <h4 className="label">Built on</h4>
          {source.video ? (
            <a href={source.video.url ?? undefined} target="_blank" rel="noreferrer" className="flex gap-3 items-start rounded-[12px] border border-line p-2.5 bg-bg hover:border-brand transition-colors">
              <Thumb video={source.video} className="w-[64px] h-[86px]" />
              <div className="min-w-0 grid gap-1.5">
                <span className="flex gap-1.5 items-center text-[13px] font-semibold">
                  <Avatar name={source.video.author} size={20} ring={!source.own} />@{source.video.author}
                </span>
                <span className="text-[13.5px] font-medium leading-snug line-clamp-2">&ldquo;{source.video.hook || source.video.caption || "Untitled video"}&rdquo;</span>
                <span className="flex flex-wrap gap-1.5 items-center">
                  <span className="pill">{compact(source.video.views)} views</span>
                  {source.borrow && <BorrowScore score={source.borrow.score} parts={source.borrow.parts} />}
                </span>
              </div>
            </a>
          ) : source.trend ? (
            <div className="rounded-[12px] border border-line p-3 grid gap-2 bg-bg">
              <div className="flex gap-2 items-center flex-wrap">
                <span className={source.trend.kind === "sound" ? "pill pill-cyan" : "pill"}>{source.trend.kind === "sound" ? "Sound" : "Hashtag"}</span>
                <strong className={source.trend.kind === "hashtag" ? "mono" : ""}>{source.trend.label}</strong>
              </div>
              <div className="flex items-end gap-4">
                <TrendBars prior={source.trend.prior} recent={source.trend.recent} />
                <div className="grid gap-1">
                  <span className="flex gap-2 items-center">
                    <StageBar stage={source.trend.stage} />
                    <span className="mono text-[12px]">{STAGE_LABEL[source.trend.stage]}</span>
                  </span>
                  <span className="caption">{source.trend.creators} creators in your niche</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-2">Your profile and goal.</p>
          )}
          <h4 className="label">Why it works</h4>
          <ul className="m-0 p-0 list-none grid gap-2 text-[13.5px] leading-snug">
            {idea.why.map((w, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="mt-0.5 grid place-items-center w-4 h-4 rounded-full bg-pos-bg text-pos shrink-0">
                  <IconCheck className="w-2.5 h-2.5" />
                </span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
          <h4 className="label">Make it yours</h4>
          <p className="make text-[13.5px] leading-snug">{idea.make_it_yours}</p>
        </section>
      </div>
      <div className="border-t border-line px-[18px] py-3.5 bg-[color-mix(in_srgb,var(--tint)_7%,var(--surface))] flex flex-wrap gap-2.5 items-center">
        {sample ? null : run ? (
          <span className="text-[13.5px] font-semibold text-ink">In your week. Post it, and we find it by its words on the next read.</span>
        ) : (
          <form action={addToWeekAction}>
            <input type="hidden" name="plan" value={planId} />
            <input type="hidden" name="rank" value={rank} />
            <SubmitButton className="btn btn-primary" pending="Adding…">
              Add to my week
            </SubmitButton>
          </form>
        )}
        <CopyText text={scriptText(idea)} />
      </div>
    </details>
  );
}

/** A video's cover, or a tinted tile with its creator's initial when we have none. */
export function Thumb({ video, className = "" }: { video: Pick<Video, "cover_url" | "author">; className?: string }) {
  return video.cover_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- stored or TikTok cover; a broken link shows the tile behind
    <img src={video.cover_url} alt="" className={`rounded-[8px] object-cover bg-muted shrink-0 ${className}`} loading="lazy" />
  ) : (
    <span className={`rounded-[8px] shrink-0 grid place-items-center bg-[linear-gradient(160deg,var(--brand-soft),var(--cyan-soft))] ${className}`}>
      <Avatar name={video.author} size={22} />
    </span>
  );
}

/** Last week against this week, as two bars. */
function TrendBars({ prior, recent }: { prior: number; recent: number }) {
  const top = Math.max(1, prior, recent);
  return (
    <span className="flex items-end gap-1.5 h-10" aria-label={`${prior} videos last week, ${recent} this week`}>
      {[
        [prior, "last", "bg-line-strong"],
        [recent, "this", "bg-cyan"],
      ].map(([n, k, cls]) => (
        <span key={k as string} className="grid justify-items-center gap-0.5">
          <span className={`w-5 rounded-t-[4px] ${cls}`} style={{ height: `${Math.max(8, ((n as number) / top) * 32)}px` }} />
          <span className="mono text-[10px] text-ink-3">{n as number}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * The closed card's proof, shown not told: the video it builds on and how far it
 * beat its usual (or the trend's week), and the bar this idea is checked against.
 */
function Evidence({ source, normal }: { source: IdeaSource; normal: Normal }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {source.video ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-3 py-1">
          <Thumb video={source.video} className="w-6 h-8 !rounded-[5px]" />
          {source.times !== null ? (
            <span className="text-[13px]">
              <b className={source.times >= 2 ? "stat-up font-extrabold" : "font-bold"}>{times(source.times)}</b> {source.own ? "your" : "their"} usual
            </span>
          ) : (
            <span className="text-[13px] font-semibold">{compact(source.video.views)} views</span>
          )}
        </span>
      ) : source.trend ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5">
          <StageBar stage={source.trend.stage} />
          <span className="text-[13px]">
            <b>{source.trend.prior}→{source.trend.recent}</b> videos this week
          </span>
        </span>
      ) : null}
      {normal.views !== null && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[13px]" title="We find it when you post and check its views 48 hours later.">
          <IconTarget className="text-brand" />
          Beat <b className="tnum">{compact(normal.views)}</b> views
        </span>
      )}
    </div>
  );
}

/**
 * A spec line in full, never cut off: the part before the first ", ", " · ",
 * " — " or "(" (the time, the sound's name, the format) reads first, the rest
 * smaller beneath it.
 */
export function SpecValue({ text }: { text: string }) {
  const m = text.match(/^(.{3,48}?)(?:,\s+|\s+·\s+|\s+[—–-]\s+|\s+(?=\())(.+)$/);
  return m ? (
    <div className="leading-snug">
      <div className="text-[14px] font-semibold">{m[1]}</div>
      <div className="text-[12.5px] text-ink-3 mt-0.5">{m[2]}</div>
    </div>
  ) : (
    <div className="text-[14px] font-semibold leading-snug">{text}</div>
  );
}
