import type { Ad, Opportunity, OpportunityType } from "@/lib/db/types";

import Avatar from "./avatar";
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

/** One decision: the competitor move, what it likely means, why it matters to you, and the campaign to run. */
export default function OpportunityCard({ o, ads, refs }: { o: Opportunity; ads: Map<string, Ad>; refs: Map<string, SignalRef> }) {
  const t = OPPORTUNITY[o.type];
  const b = o.brief;
  return (
    <article className="card p-5 flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className={t.cls}>{t.label}</span>
        <span className="caption text-right">
          Urgency {LEVEL[o.urgency].toLowerCase()} · Confidence {LEVEL[o.confidence].toLowerCase()}
        </span>
      </div>
      <h3 className="text-[16px] font-semibold leading-snug mt-3">{o.title}</h3>
      {o.competitors.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {o.competitors.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 mr-1.5">
              <Avatar name={c} size={16} />
              {c}
            </span>
          ))}
        </div>
      )}

      <dl className="m-0 mt-4 flex flex-col gap-3 text-[13.5px] leading-[1.6]">
        <div>
          <dt className="text-[12px] font-medium text-ink-3">What we saw</dt>
          <dd className="m-0 mt-0.5">{o.signal}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-medium text-ink-3">Likely intent</dt>
          <dd className="m-0 mt-0.5 text-ink-2">{o.intent}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-medium text-ink-3">For you</dt>
          <dd className="m-0 mt-0.5 text-ink-2">{o.fit}</dd>
        </div>
      </dl>

      <div className="well px-3.5 py-3 mt-4">
        <div className="text-[12px] font-medium text-ink-3">{o.type === "ignore" ? "Instead" : "What to do"}</div>
        <p className="text-[13.5px] font-medium leading-[1.55] mt-1">{o.recommendation}</p>
      </div>

      {o.type !== "ignore" && b.hook && (
        <details className="mt-3 group">
          <summary className="text-[13px] font-medium text-ink-2 hover:text-ink cursor-pointer flex items-center gap-1.5">
            <span className="transition-transform group-open:rotate-90">›</span> Campaign brief
          </summary>
          <blockquote className="m-0 mt-3 border-l-2 border-ink pl-3 text-[15px] font-medium leading-[1.45]">&ldquo;{b.hook.replace(/^["“]|["”]$/g, "")}&rdquo;</blockquote>
          <dl className="m-0 mt-3 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.5]">
            <Field k="Angle" v={b.angle} />
            <Field k="Offer" v={b.offer} />
            <Field k="Format" v={b.format} />
            <Field k="Creative" v={b.creative} />
            <Field k="Audience" v={b.audience} />
            <Field k="Test" v={b.experiment} />
          </dl>
        </details>
      )}

      <div className="mt-auto">
        <Evidence ids={o.evidence} ads={ads} refs={refs} label="Signals" />
      </div>
    </article>
  );
}
