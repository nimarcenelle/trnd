import Link from "next/link";

import SubmitButton from "@/components/app/submit-button";
import type { BrandPick, PickRun } from "@/lib/db/types";
import ListRunsComplete from "@/components/picks/list-runs-complete";
import { formatUsd } from "@/lib/picks/format";
import { runChip, runRatesLine, shortDate, truncateFinding } from "@/lib/picks/list";
import { killPickRunAction, launchRunAction } from "@/lib/picks/run-actions";
import { OUTCOME_LABEL, OUTCOME_TONE, runOutcome, STATUS_MEANING, type OutcomeContext } from "@/lib/record/outcome";

/**
 * The tests an owner chose, newest first, at the top of Campaigns. A
 * planned one can be marked launched; a launched one can be closed with
 * whatever results the owner has, or stopped; an ended one says how it
 * ended, what it did, and what the owner said it taught.
 */
export default function ListRuns({ runs, outcomes = {} }: { runs: { run: PickRun; pick: BrandPick }[]; outcomes?: OutcomeContext }) {
  if (runs.length === 0) return null;
  return (
    <section className="picks-section" aria-labelledby="picks-runs-title">
      <div className="panel__head mb-3">
        <h2 id="picks-runs-title" className="panel__title m-0">
          Your tests
        </h2>
        <span className="panel__meta">{runs.length}</span>
      </div>
      <ul className="picks-runs">
        {runs.map(({ run, pick }) => {
          // An ended run wears its outcome, not its status: "Won" says more
          // than "Completed". A run that has not ended wears where it is.
          const read = runOutcome(run, outcomes);
          const chip =
            read.outcome === "won" || read.outcome === "lost"
              ? { label: OUTCOME_LABEL[read.outcome], tone: OUTCOME_TONE[read.outcome] }
              : runChip(run.status);
          const results = run.status === "completed" ? resultsLine(run) : null;
          const verdictLine = run.status !== "running" && run.status !== "planned" && read.basis !== "none" ? read.reason : null;
          const title = pick.concept_title ?? truncateFinding(pick.finding);
          return (
            <li key={run.id} className="picks-run">
              <div className="picks-run__main">
                <Link href={`/app/picks/${pick.id}`} className="picks-run__finding" title={title}>
                  {title}
                </Link>
                <p className="picks-run__meta">
                  {run.status === "planned" ? `Chosen ${shortDate(run.started_at)}` : `Launched ${shortDate(run.launched_at ?? run.started_at)}`}
                  {run.ended_at ? ` · Ended ${shortDate(run.ended_at)}` : ""}
                  {` · ${STATUS_MEANING[run.status]}`}
                </p>
                {results && <p className="picks-run__stats">{results}</p>}
                {verdictLine && !results?.includes(verdictLine) && <p className="picks-run__stats">{verdictLine}</p>}
                {run.learned && <p className="picks-run__stats">Learned: {run.learned}</p>}
              </div>
              {chip && (
                <span className={`badge badge--${chip.tone}`}>
                  <i />
                  {chip.label}
                </span>
              )}
              {run.status === "planned" && (
                <div className="picks-run__actions">
                  <form action={launchRunAction}>
                    <input type="hidden" name="run_id" value={run.id} />
                    <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Saving…">
                      Mark launched
                    </SubmitButton>
                  </form>
                </div>
              )}
              {run.status === "running" && (
                <div className="picks-run__actions">
                  <ListRunsComplete runId={run.id} />
                  <form action={killPickRunAction}>
                    <input type="hidden" name="run_id" value={run.id} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Saving…">
                      Stop it
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

/** "$450 spent · 12,000 impressions · CTR 2% · CVR 3.3% · ROAS 2.4x" */
function resultsLine(run: PickRun): string | null {
  const count = (n: number | null | undefined, one: string, many: string) =>
    typeof n === "number" ? `${n.toLocaleString("en-US")} ${n === 1 ? one : many}` : null;
  const money = (n: number | null | undefined, what: string) =>
    typeof n === "number" && n > 0 ? `${formatUsd(Number(n))} ${what}` : null;
  const parts = [
    money(run.spend_usd, "spent"),
    count(run.impressions, "impression", "impressions"),
    count(run.clicks, "click", "clicks"),
    count(run.conversions, "purchase", "purchases"),
    money(run.revenue_usd, "revenue"),
    runRatesLine({
      spend_usd: numeric(run.spend_usd),
      impressions: numeric(run.impressions),
      clicks: numeric(run.clicks),
      conversions: numeric(run.conversions),
      revenue_usd: numeric(run.revenue_usd),
    }),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// Postgres numeric can arrive as a string.
function numeric(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
