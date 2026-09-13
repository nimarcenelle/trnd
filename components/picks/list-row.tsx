import Link from "next/link";

import type { BrandPick, PickRun } from "@/lib/db/types";
import { formatBet, formatMetric } from "@/lib/picks/format";
import { arrowGlyph, runChip, truncateFinding } from "@/lib/picks/list";

/**
 * One ranked pick as a single full-width link. The finding is the link's
 * name; the metric, bet and status are its description, so a screen reader
 * hears the finding first and the numbers after, the order an owner scans.
 * No score of any kind: the rank is the only judgement the list shows.
 */
export default function ListRow({ pick, run }: { pick: BrandPick; run: PickRun | null }) {
  const metric = formatMetric(pick);
  const chip = runChip(run?.status);
  const id = `pick-${pick.id}`;
  return (
    <Link
      href={`/app/picks/${pick.id}`}
      className="picks-row"
      aria-label={pick.finding}
      aria-describedby={`${id}-metric ${id}-bet${chip ? ` ${id}-status` : ""}`}
    >
      <span className="picks-row__rank" aria-hidden="true">
        {pick.rank}
      </span>
      <span className="picks-row__finding" title={pick.finding}>
        {truncateFinding(pick.finding)}
      </span>
      <span className="picks-row__meta">
        <span id={`${id}-metric`} className={`picks-row__metric is-${metric.direction}`}>
          <span className="picks-row__arrow" aria-hidden="true">
            {arrowGlyph(metric.direction)}
          </span>
          {metric.text}
        </span>
        <span id={`${id}-bet`} className="picks-row__bet">
          {formatBet(pick)}
        </span>
        <span className="picks-row__status">
          {chip && (
            <span id={`${id}-status`} className={`badge badge--${chip.tone}`}>
              <i />
              {chip.label}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
