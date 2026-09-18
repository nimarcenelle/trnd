import type { StrategyRead } from "@/lib/research/strategist";

/**
 * The week's account read, above the picks: the situation the strategist
 * saw, where the brand and the market disagree, what no rival is saying,
 * and what not to do this month. Every brief that week was written inside
 * this read, so the reader sees the reasoning before the concept.
 */
export default function WeekRead({ read, brand }: { read: StrategyRead; brand: string }) {
  const lists: { title: string; items: string[] }[] = [
    { title: "Where the brand and the market disagree", items: read.tensions },
    { title: "What no rival is saying", items: read.whitespace },
    { title: "Not this month", items: read.do_not },
  ].filter((l) => l.items.length > 0);
  return (
    <details className="wread" open>
      <summary className="wread__summary">
        <span className="wread__eyebrow">This week&apos;s read</span>
        <span className="wread__title">Where {brand} is, before any brief</span>
      </summary>
      <p className="wread__situation">{read.situation}</p>
      <div className="wread__grid">
        {lists.map((l) => (
          <div key={l.title} className="wread__col">
            <h3 className="wread__h">{l.title}</h3>
            <ul className="wread__list">
              {l.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {read.unknowns.length > 0 && (
        <p className="wread__unknowns">
          <b>What would change this read:</b> {read.unknowns.join(" ")}
        </p>
      )}
    </details>
  );
}
