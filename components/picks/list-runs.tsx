import Link from "next/link";

import SubmitButton from "@/components/app/submit-button";
import type { BrandPick, PickRun } from "@/lib/db/types";
import ListRunsComplete from "@/components/picks/list-runs-complete";
import { formatBet, formatUsd } from "@/lib/picks/format";
import { runChip, runRatesLine, shortDate, truncateFinding } from "@/lib/picks/list";
import { killPickRunAction } from "@/lib/picks/run-actions";

/**
 * The picks an owner said they are running, newest first, at the top of
 * Campaigns. A running one can be closed out from here without opening the
 * pick, with whatever results the owner has; an ended one says how it ended,
 * when, and what it did (CTR, CVR and ROAS where the numbers allow).
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
          const results = run.status === "completed" ? resultsLine(run) : null;
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
                {results && <p className="picks-run__stats">{results}</p>}
              </div>
              {chip && (
                <span className={`badge badge--${chip.tone}`}>
                  <i />
                  {chip.label}
                </span>
              )}
              {run.status === "running" && (
                <div className="picks-run__actions">
                  <ListRunsComplete runId={run.id} />
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
