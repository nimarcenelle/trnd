import type { BriefingRow } from "@/lib/recommend/briefing";

/**
 * The left rail: the same questions, same order, every pick.
 *
 * Deliberately has no expand/collapse and no scores. An owner should be
 * able to sweep it without deciding to — the moment it needs a click it
 * stops being a habit. Slots with nothing real behind them were dropped
 * upstream, so every row here is a claim that traces to something.
 */
export default function PickBriefing({ rows }: { rows: BriefingRow[] }) {
  if (rows.length === 0) return null;
  return (
    <aside className="briefing" aria-labelledby="briefing-h">
      <h2 className="briefing__h" id="briefing-h">
        Insights behind this pick
      </h2>
      <dl className="briefing__list">
        {rows.map((row) => (
          <div className="briefing__row" key={row.slot}>
            <dt className="briefing__slot">{row.slot}</dt>
            <dd className="briefing__text">{row.text}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
