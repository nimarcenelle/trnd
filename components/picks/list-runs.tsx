import Link from "next/link";

import SubmitButton from "@/components/app/submit-button";
import type { BrandPick, PickRun } from "@/lib/db/types";
import { formatBet } from "@/lib/picks/format";
import { runChip, shortDate, truncateFinding } from "@/lib/picks/list";
import { completePickRunAction, killPickRunAction } from "@/lib/picks/run-actions";

/**
 * The picks an owner said they are running, newest first, at the top of
 * Campaigns. A running one can be closed out from here without opening the
 * pick; an ended one just says how it ended and when.
 */
export default function ListRuns({ runs }: { runs: { run: PickRun; pick: BrandPick }[] }) {
  if (runs.length === 0) return null;
  return (
    <section className="picks-section" aria-labelledby="picks-runs-title">
      <div className="panel__head mb-3">
        <h2 id="picks-runs-title" className="panel__title m-0">
          Running from picks
        </h2>
        <span className="panel__meta">{runs.length}</span>
      </div>
      <ul className="picks-runs">
        {runs.map(({ run, pick }) => {
          const chip = runChip(run.status);
          return (
            <li key={run.id} className="picks-run">
              <div className="picks-run__main">
                <Link href={`/app/picks/${pick.id}`} className="picks-run__finding" title={pick.finding}>
                  {truncateFinding(pick.finding)}
                </Link>
                <p className="picks-run__meta">
                  {formatBet(pick)} · Started {shortDate(run.started_at)}
                  {run.ended_at ? ` · Ended ${shortDate(run.ended_at)}` : ""}
                </p>
              </div>
              {chip && (
                <span className={`badge badge--${chip.tone}`}>
                  <i />
                  {chip.label}
                </span>
              )}
              {run.status === "running" && (
                <div className="picks-run__actions">
                  <form action={completePickRunAction}>
                    <input type="hidden" name="run_id" value={run.id} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                      Mark completed
                    </SubmitButton>
                  </form>
                  <form action={killPickRunAction}>
                    <input type="hidden" name="run_id" value={run.id} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                      Kill it
                    </SubmitButton>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
