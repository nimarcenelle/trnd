import type { Ad, Opportunity, OpportunityType } from "@/lib/db/types";
import { cleanCopy, daysRunningOf, libraryLink, tagLabel } from "@/lib/format";

import { ScoreBadge } from "./ad-card";
import AdThumb from "./ad-thumb";
import Avatar from "./avatar";
import CopyBrief from "./copy-brief";
import Evidence, { type SignalRef } from "./evidence";

export const OPPORTUNITY: Record<OpportunityType, { label: string; cls: string; blurb: string }> = {
  get_ahead: { label: "Get ahead", cls: "badge badge-pos", blurb: "An opening before the market crowds it" },
  win_choice: { label: "Win the choice", cls: "badge badge-info", blurb: "Stand out where everyone sounds the same" },
  counter: { label: "Counter", cls: "badge badge-warn", blurb: "A competitor push that threatens you" },
  ignore: { label: "Ignore", cls: "badge", blurb: "Doesn't fit your customers or economics" },
};

const LEVEL = { high: "High", medium: "Medium", low: "Low" } as const;

function Field({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="contents">
      <dt className="text-ink-3">{k}</dt>
      <dd className="m-0 text-ink-2">{v}</dd>
    </div>
  );
}

/** The brief as a creator reads it: one labeled line per part, the why on top. */
export function briefText(o: Opportunity): string {
  const b = o.brief;
  const lines = [
    o.title,
    `Why: ${o.fit}`,
    `What we saw: ${o.signal}`,
    "",
    `Hook: ${b.hook}`,
    `Angle: ${b.angle}`,
    b.offer && b.offer.toLowerCase() !== "none" ? `Offer: ${b.offer}` : null,
    `Format: ${b.format}`,
    `Creative: ${b.creative}`,
    `Audience: ${b.audience}`,
    `Test: ${b.experiment}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** The angle a move rests on, counted on both sides: how many live ads the rival and the brand run on it. */
export interface MoveVs {
  angle: string;
  them: { name: string; n: number; of: number };
  you: { n: number; of: number } | null;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 sm:pl-[60px]">
      <h4 className="text-[12px] font-medium text-ink-3 m-0">
        <span className="tnum">{n}</span> · {title}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** The ads a move rests on, each a quote with how long it has run, its versions and score, opening in the Ad Library. */
function Proof({ ids, ads, refs, versions }: { ids: string[]; ads: Map<string, Ad>; refs: Map<string, SignalRef>; versions: (ad: Ad) => number }) {
  const shown = ids.map((id) => ads.get(id)).filter((a): a is Ad => Boolean(a)).slice(0, 4);
  const other = ids.filter((id) => !ads.has(id));
  if (!shown.length) return <Evidence ids={ids} ads={ads} refs={refs} label="Signals" />;
  return (
    <>
      <ul className="list-none m-0 p-0 grid gap-2">
        {shown.map((a) => {
          const days = daysRunningOf(a);
          const v = Math.max(versions(a), a.variants);
          const quote = a.hook || cleanCopy(a.title) || cleanCopy(a.body)?.split(/(?<=[.!?])\s/)[0];
          return (
            <li key={a.id}>
              <a href={libraryLink(a.archive_id)} target="_blank" rel="noreferrer" className="well flex gap-3 p-2.5 hover:border-ink-3 transition-colors">
                <span className="block w-12 h-12 rounded-md overflow-hidden border border-line shrink-0">
                  <AdThumb src={a.image_url} label="Ad" />
                </span>
                <span className="min-w-0 flex flex-col gap-1.5">
                  {quote && <span className="text-[13.5px] font-medium leading-snug">&ldquo;{quote.replace(/^["“]|["”]$/g, "")}&rdquo;</span>}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3 tnum">
                    {a.page_name && <span>{a.page_name}</span>}
                    {days !== null && <span>{a.active ? `${days} days live` : `Ran ${days} days`}</span>}
                    {v > 1 && <span>{v} versions</span>}
                    <ScoreBadge ad={a} />
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {other.length > 0 && <Evidence ids={other} ads={ads} refs={refs} label="Also" />}
    </>
  );
}

/**
 * One move, ranked: the competitor push and what it means up top, and opened,
 * the case for it in order: the proof it works for them, why, how you compare,
 * and the brief to run.
 */
export default function OpportunityCard({
  o,
  n,
  ads,
  refs,
  versions,
  vs,
  goal,
  open = false,
}: {
  o: Opportunity;
  n: number;
  ads: Map<string, Ad>;
  refs: Map<string, SignalRef>;
  versions: (ad: Ad) => number;
  vs: MoveVs | null;
  goal: string | null;
  open?: boolean;
}) {
  const t = OPPORTUNITY[o.type];
  const b = o.brief;
  return (
    <details id={`move-${n}`} open={open} className="card group scroll-mt-6">
      <summary className="flex gap-4 p-5 cursor-pointer hover:bg-subtle transition-colors rounded-xl group-open:rounded-b-none">
        <span className="w-7 h-7 rounded-full bg-ink text-bg text-[13px] font-semibold grid place-items-center shrink-0 tnum">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={t.cls}>{t.label}</span>
            {o.status === "new" && <span className="badge badge-pos" title="Added by this scan">New</span>}
            {o.status === "updated" && <span className="badge badge-info" title="The signals behind it moved this scan">Updated</span>}
            {o.competitors.slice(0, 2).map((c) => (
              <span key={c} className="badge badge-outline">
                <Avatar name={c} size={14} />
                vs {c}
              </span>
            ))}
            <span className="caption ml-1">
              Urgency {LEVEL[o.urgency].toLowerCase()} · Confidence {LEVEL[o.confidence].toLowerCase()}
            </span>
          </div>
          <h3 className="text-[16px] font-semibold leading-snug mt-2.5">{o.title}</h3>
          <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-1">{o.signal}</p>
        </div>
        <span className="w-5 h-7 grid place-items-center self-start shrink-0 text-ink-3 text-[18px] leading-none" aria-hidden>
          <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>

      <div className="border-t border-line divide-y divide-line">
        <Step n={1} title="Proof it's working for them">
          <Proof ids={o.evidence} ads={ads} refs={refs} versions={versions} />
        </Step>
        <Step n={2} title="Why it works">
          <p className="text-[13.5px] leading-[1.6] m-0">{o.intent}</p>
        </Step>
        <Step n={3} title="You vs. them">
          {vs && (
            <div className="grid grid-cols-2 gap-2 mb-3 max-w-[460px]">
              <div className="well px-3.5 py-2.5">
                <div className="text-[20px] font-semibold tracking-tight tnum">
                  {vs.them.n} <span className="text-[13px] font-normal text-ink-3">of {vs.them.of}</span>
                </div>
                <div className="caption">{vs.them.name} live ads on {tagLabel(vs.angle).toLowerCase()}</div>
              </div>
              <div className="well px-3.5 py-2.5">
                <div className="text-[20px] font-semibold tracking-tight tnum">{vs.you ? <>{vs.you.n} <span className="text-[13px] font-normal text-ink-3">of {vs.you.of}</span></> : "—"}</div>
                <div className="caption">{vs.you ? `Yours on ${tagLabel(vs.angle).toLowerCase()}` : "Your own ads aren't read yet"}</div>
              </div>
            </div>
          )}
          <p className="text-[13.5px] text-ink-2 leading-[1.6] m-0">{o.fit}</p>
        </Step>
        <Step n={4} title={o.type === "ignore" ? "Instead" : "Do this"}>
          <p className="text-[14px] font-medium leading-[1.55] m-0">{o.recommendation}</p>
          {o.type !== "ignore" && b.hook && (
            <>
              <blockquote className="m-0 mt-3 border-l-2 border-ink pl-3 text-[15px] font-medium leading-[1.45]">&ldquo;{b.hook.replace(/^["“]|["”]$/g, "")}&rdquo;</blockquote>
              <dl className="m-0 mt-3 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.5]">
                <Field k="Angle" v={b.angle} />
                <Field k="Offer" v={b.offer} />
                <Field k="Format" v={b.format} />
                <Field k="Creative" v={b.creative} />
                <Field k="Audience" v={b.audience} />
                <Field k="Test" v={b.experiment} />
                {goal && <Field k="Judged on" v={goal} />}
              </dl>
              <CopyBrief text={briefText(o)} />
            </>
          )}
        </Step>
      </div>
    </details>
  );
}
