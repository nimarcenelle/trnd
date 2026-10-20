import { addToWeekAction } from "@/lib/actions";
import { BORROW_WEIGHTS, type BorrowParts, type Normal, type TrendRow } from "@/lib/creators/stats";
import type { Idea, IdeaRun, IdeaType, Video } from "@/lib/db/types";
import { compact, times } from "@/lib/format";

import Avatar from "./avatar";
import CopyText from "./copy-text";
import { StageBar, STAGE_LABEL } from "./stage";
import SubmitButton from "./submit-button";

export const IDEA_TYPE: Record<IdeaType, { label: string; cls: string }> = {
  double_down: { label: "Double down on you", cls: "pill pill-pos" },
  borrow: { label: "Borrow a format", cls: "pill pill-brand" },
  ride: { label: "Ride a trend early", cls: "pill pill-cyan" },
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
    <details id={`idea-${rank}`} open={open} className="card !rounded-[18px] overflow-hidden group scroll-mt-20">
      <summary className="grid grid-cols-[auto_minmax(0,1fr)_auto] max-[560px]:grid-cols-[minmax(0,1fr)_auto] gap-3.5 items-start p-[18px] hover:bg-subtle">
        <span className="display text-[26px] text-brand leading-none w-[22px] text-center max-[560px]:hidden">{rank}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            <span className={t.cls}>{t.label}</span>
            {from && <span className="pill">{from}</span>}
            {run && <span className="pill pill-pos">In your week</span>}
          </div>
          <p className="heading text-[clamp(17px,2.4vw,21px)] leading-[1.25]">{idea.hook}</p>
          <p className="text-ink-2 text-[14px] mt-1.5 max-w-[72ch]">{idea.so}</p>
          {normal.low !== null && normal.high !== null && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[13px]">
              <span className="text-ink-2">Your typical video:</span>
              <span>
                <b className="mono font-medium">
                  {compact(normal.low)}–{compact(normal.high)}
                </b>{" "}
                views
              </span>
              <span className="text-ink-3">We check this one against that, 48 hours after you post.</span>
            </p>
          )}
        </div>
        <span className="text-[20px] text-ink-3 w-5 h-7 grid place-items-center" aria-hidden>
          <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>

      <div className="border-t border-line grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="p-[18px] grid gap-3 content-start min-w-0">
          <h4 className="label">The script, second by second</h4>
          <div className="border border-line rounded-[10px] overflow-hidden">
            {idea.script.map((b, i) => (
              <div key={i} className="grid grid-cols-[62px_minmax(0,1fr)] max-[560px]:grid-cols-[50px_minmax(0,1fr)] gap-3 px-3 py-2.5 border-b border-line last:border-b-0">
                <span className="mono text-[12px] text-brand font-medium">{b.t}</span>
                <div>
                  <div className="font-semibold">{b.say}</div>
                  <div className="text-[13px] text-ink-2">{b.shot}</div>
                </div>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-[100px_minmax(0,1fr)] max-[560px]:grid-cols-1 gap-x-3 gap-y-1.5 m-0 text-[14px]">
            {[
              ["Length", idea.length],
              ["Sound", idea.sound],
              ["Post", idea.post_time],
              ["Format", idea.format],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-2 text-[12.5px]">{k}</dt>
                <dd className="m-0 font-medium min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
          <h4 className="label">Caption</h4>
          <p className="bg-muted rounded-lg px-3 py-2.5 text-[14px]">{idea.caption}</p>
          <h4 className="label">Hashtags</h4>
          <div className="flex flex-wrap gap-1.5">
            {idea.hashtags.map((h) => (
              <span key={h} className="chip chip-tag">
                {h.startsWith("#") ? h : `#${h}`}
              </span>
            ))}
          </div>
        </section>

        <section className="p-[18px] grid gap-3 content-start min-w-0 border-t md:border-t-0 md:border-l border-line">
          <h4 className="label">Where this comes from</h4>
          {source.video ? (
            <div className="border border-line rounded-[10px] p-3 grid gap-1.5 bg-bg">
              <div className="flex gap-2 items-center">
                <Avatar name={source.video.author} size={28} />
                <strong>@{source.video.author}</strong>
              </div>
              <a href={source.video.url ?? undefined} target="_blank" rel="noreferrer" className="font-semibold hover:underline line-clamp-3">
                &ldquo;{source.video.hook || source.video.caption || "Untitled video"}&rdquo;
              </a>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="pill">{compact(source.video.views)} views</span>
                {source.times !== null && <span className={source.times >= 2 ? "pill pill-pos" : "pill"}>{times(source.times)} {source.own ? "your" : "their"} usual</span>}
                {source.borrow && <BorrowScore score={source.borrow.score} parts={source.borrow.parts} />}
              </div>
              {source.video.posted_at && <div className="caption">Posted {new Date(source.video.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
            </div>
          ) : source.trend ? (
            <div className="border border-line rounded-[10px] p-3 grid gap-1.5 bg-bg">
              <div className="flex gap-2 items-center flex-wrap">
                <span className={source.trend.kind === "sound" ? "pill pill-cyan" : "pill"}>{source.trend.kind === "sound" ? "Sound" : "Hashtag"}</span>
                <strong className={source.trend.kind === "hashtag" ? "mono" : ""}>{source.trend.label}</strong>
              </div>
              <div className="text-[13px] text-ink-2">
                {source.trend.recent} videos this week, {source.trend.prior} last week, from {source.trend.creators} creators in your niche
              </div>
              <div className="flex gap-2 items-center">
                <StageBar stage={source.trend.stage} />
                <span className="mono text-[12px]">{STAGE_LABEL[source.trend.stage]}</span>
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-2">Written from your profile and goal.</p>
          )}
          <h4 className="label">Why it works</h4>
          <ul className="m-0 pl-[18px] grid gap-1.5 text-[14px]">
            {idea.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <h4 className="label">Make it yours</h4>
          <p className="make text-[14px]">{idea.make_it_yours}</p>
        </section>
      </div>
      <div className="border-t border-line px-[18px] py-3.5 bg-brand-soft flex flex-wrap gap-2.5 items-center">
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
