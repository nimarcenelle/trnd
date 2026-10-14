import type { Ad, Play } from "@/lib/db/types";

import Brief from "./brief";
import Evidence from "./evidence";

/** An ad to make next: the hook up front, then format, creative, offer and audience, and what it's modeled on. */
export default function PlayCard({ play, n, ads }: { play: Play; n: number; ads: Map<string, Ad> }) {
  const rows = [
    ["Format", play.format],
    ["Creative", play.creative],
    ["Offer", play.offer],
    ["Audience", play.audience],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  return (
    <article className="card p-5 flex flex-col">
      <span className="caption">Idea {n}</span>
      <h3 className="text-[15px] font-semibold leading-snug mt-1">{play.title}</h3>
      {play.hook ? (
        <>
          <blockquote className="m-0 mt-3 border-l-2 border-ink pl-3 text-[15px] font-medium leading-[1.45]">&ldquo;{play.hook.replace(/^["“]|["”]$/g, "")}&rdquo;</blockquote>
          <dl className="m-0 mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.5]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{k}</dt>
                <dd className="m-0 text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="well px-3.5 py-3 mt-4">
            <div className="text-[12px] font-medium text-ink-3">Why it should work</div>
            <p className="text-[13px] leading-[1.55] mt-1">{play.why}</p>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-2 leading-[1.6] mt-2">{play.why}</p>
          {play.brief && (
            <div className="well p-3.5 mt-4">
              <Brief text={play.brief} />
            </div>
          )}
        </>
      )}
      <div className="mt-auto">
        <Evidence ids={play.inspired_by} ads={ads} label="Modeled on" />
      </div>
    </article>
  );
}
