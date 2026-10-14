import type { Ad, Opportunity, OpportunityType } from "@/lib/db/types";

import Avatar from "./avatar";
import Evidence, { type SignalRef } from "./evidence";

export const OPPORTUNITY: Record<OpportunityType, { label: string; cls: string; blurb: string }> = {
  get_ahead: { label: "Get ahead", cls: "badge badge-pos", blurb: "An opening before the market crowds it" },
  win_choice: { label: "Win the choice", cls: "badge badge-info", blurb: "Stand out where everyone sounds the same" },
  counter: { label: "Counter", cls: "badge badge-warn", blurb: "A competitor push that threatens you" },
  ignore: { label: "Ignore", cls: "badge", blurb: "Doesn't fit your customers or economics" },
};

function Field({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="contents">
      <dt className="text-ink-3">{k}</dt>
      <dd className="m-0 text-ink-2">{v}</dd>
    </div>
  );
}

/** The detail behind a decision: what we saw, the likely intent, why it matters to you, what to do, the brief. */
function Detail({ o, ads, refs }: { o: Opportunity; ads: Map<string, Ad>; refs: Map<string, SignalRef> }) {
  const b = o.brief;
  return (
    <div className="flex flex-col gap-3">
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)] sm:grid-cols-3 gap-3 text-[13.5px] leading-[1.6]">
        {o.signal && (
          <div>
            <dt className="text-[12px] font-medium text-ink-3">What we saw</dt>
            <dd className="m-0 mt-0.5">{o.signal}</dd>
          </div>
        )}
        {o.intent && (
          <div>
            <dt className="text-[12px] font-medium text-ink-3">Likely intent</dt>
            <dd className="m-0 mt-0.5 text-ink-2">{o.intent}</dd>
          </div>
        )}
        <div>
          <dt className="text-[12px] font-medium text-ink-3">For you</dt>
          <dd className="m-0 mt-0.5 text-ink-2">{o.fit}</dd>
        </div>
      </dl>
      <div className="well px-3.5 py-3">
        <div className="text-[12px] font-medium text-ink-3">{o.type === "ignore" ? "Instead" : "What to do"}</div>
        <p className="text-[13.5px] font-medium leading-[1.55] mt-1">{o.recommendation}</p>
      </div>
      {o.type !== "ignore" && b.hook && (
        <div className="rounded-[10px] border border-line p-4">
          <div className="text-[12px] font-medium text-ink-3">Campaign brief</div>
          <blockquote className="m-0 mt-2 border-l-2 border-ink pl-3 text-[15px] font-medium leading-[1.45]">&ldquo;{b.hook.replace(/^["“]|["”]$/g, "")}&rdquo;</blockquote>
          <dl className="m-0 mt-3 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.5]">
            <Field k="Angle" v={b.angle} />
            <Field k="Offer" v={b.offer} />
            <Field k="Format" v={b.format} />
            <Field k="Creative" v={b.creative} />
            <Field k="Audience" v={b.audience} />
            <Field k="Test" v={b.experiment} />
          </dl>
        </div>
      )}
      <Evidence ids={o.evidence} ads={ads} refs={refs} label="Signals" />
    </div>
  );
}

/** One decision in the feed: the type, the call and the line behind it; tap for the detail and the brief. */
export function OpportunityRow({ o, n, ads, refs }: { o: Opportunity; n: number; ads: Map<string, Ad>; refs: Map<string, SignalRef> }) {
  const t = OPPORTUNITY[o.type];
  return (
    <details className="group">
      <summary className="flex gap-4 px-5 py-4 cursor-pointer hover:bg-subtle transition-colors list-none [&::-webkit-details-marker]:hidden">
        <span className="w-6 h-6 rounded-full bg-muted text-ink-2 text-[12px] font-semibold grid place-items-center shrink-0 tnum mt-0.5">{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={t.cls}>{t.label}</span>
            {o.competitors.slice(0, 3).map((c) => (
              <span key={c} className="inline-flex items-center gap-1 text-[12.5px] text-ink-2">
                <Avatar name={c} size={16} />
                {c}
              </span>
            ))}
            {o.type !== "ignore" && <span className="caption ml-auto hidden sm:inline">Urgency {o.urgency}</span>}
          </div>
          <h3 className="text-[15px] font-semibold leading-snug mt-2">{o.title}</h3>
          <p className="text-[13.5px] text-ink-2 leading-[1.55] mt-0.5">{o.punch ?? o.recommendation}</p>
        </div>
        <span className="text-ink-3 transition-transform group-open:rotate-90 self-center shrink-0" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="px-5 pb-5 sm:pl-[60px]">
        <Detail o={o} ads={ads} refs={refs} />
      </div>
    </details>
  );
}
