import Link from "next/link";

import type { BrandPick, PickRun } from "@/lib/db/types";
import { formatBet, formatMetric } from "@/lib/picks/format";
import { arrowGlyph, gradeChip, runChip, truncateFinding } from "@/lib/picks/list";

/**
 * One ranked pick as a single full-width link. The finding is the link's
 * name; the grade, metric, bet and status are its description, so a screen
 * reader hears the finding first and the judgement and numbers after, the
 * order an owner scans. The grade shows as its letter only; what the letter
 * means is its title and its spoken description. A pick written before the
 * grade existed shows no chip.
 */
export default function ListRow({ pick, run }: { pick: BrandPick; run: PickRun | null }) {
  const metric = formatMetric(pick);
  const chip = runChip(run?.status);
  const grade = gradeChip(pick);
  const id = `pick-${pick.id}`;
  const describedBy = [grade ? `${id}-grade` : null, `${id}-metric`, `${id}-bet`, chip ? `${id}-status` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <Link href={`/app/picks/${pick.id}`} className="picks-row" aria-label={pick.finding} aria-describedby={describedBy}>
      <span className="picks-row__rank" aria-hidden="true">
        {pick.rank}
      </span>
      <span className="picks-row__finding" title={pick.finding}>
        {truncateFinding(pick.finding)}
      </span>
      <span className="picks-row__meta">
        {/* Always rendered, so the shared columns stay put on rows without a grade. */}
        <span className="picks-row__grade-cell">
          {grade && (
            <span id={`${id}-grade`} className={`picks-grade is-${grade.tone}`} title={grade.meaning}>
              <span aria-hidden="true">{grade.letter}</span>
              <span className="sr-only">{grade.description}</span>
            </span>
          )}
        </span>
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
