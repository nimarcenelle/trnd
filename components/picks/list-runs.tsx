import Link from "next/link";

import SubmitButton from "@/components/app/submit-button";
import type { AdHistory, BrandPick, PickRun } from "@/lib/db/types";
import ListRunsComplete from "@/components/picks/list-runs-complete";
import ListRunsFidelity from "@/components/picks/list-runs-fidelity";
import { fidelityLine } from "@/lib/picks/fidelity";
import { formatUsd } from "@/lib/picks/format";
import { runChip, runRatesLine, shortDate, truncateFinding } from "@/lib/picks/list";
import { killPickRunAction, launchRunAction, linkAdToRunAction } from "@/lib/picks/run-actions";
import { OUTCOME_LABEL, OUTCOME_TONE, runOutcome, STATUS_MEANING, type OutcomeContext } from "@/lib/record/outcome";

/**
 * The tests an owner chose, newest first, at the top of Campaigns. A
 * planned one can be marked launched; a launched one can be closed with
 * whatever results the owner has, or stopped; an ended one says how it
 * ended, what it did, and what the owner said it taught.
 */
export default function ListRuns({
  runs,
  outcomes = {},
  history = [],
}: {
  runs: { run: PickRun; pick: BrandPick }[];
  outcomes?: OutcomeContext;
  /** The brand's ad history, so an open test can be pointed at its ad by id. */
  history?: AdHistory[];
}) {
  if (runs.length === 0) return null;
  // Ads with delivery, newest first, not already linked to another test.
  const linkable = history.filter((r) => (r.impressions ?? 0) > 0 || (r.spend_cents ?? 0) > 0);
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
                {(run.status === "planned" || run.status === "running") && (
                  <LinkAd runId={run.id} linked={linkable.filter((r) => r.run_id === run.id)} candidates={linkable.filter((r) => !r.run_id)} />
                )}
                {run.fidelity_read && <p className="picks-run__stats">{fidelityLine(run.fidelity_read, numeric(run.fidelity_score))}</p>}
                {pick.brief && (
                  <ListRunsFidelity
                    runId={run.id}
                    hasLinkedCopy={history.some((r) => r.run_id === run.id && Boolean(r.copy))}
                    current={run.fidelity_read ? fidelityLine(run.fidelity_read, numeric(run.fidelity_score)) : null}
                  />
                )}
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

/** One line an owner recognises an ad by in Ads Manager. */
function adLabel(r: AdHistory): string {
  const name = r.ad_name ?? r.campaign_name;
  const spent = typeof r.spend_cents === "number" && r.spend_cents > 0 ? ` · ${formatUsd(r.spend_cents / 100)}` : "";
  const when = r.started_on ? ` · ${shortDate(r.started_on)}` : "";
  return `${name}${r.ad_name ? ` (${r.campaign_name})` : ""}${spent}${when}`.slice(0, 120);
}

/**
 * The ad this test is, by id. A brief says what to name the ad and the
 * sync finds it by that name; when the name was not used, the owner picks
 * the ad from the account history here and the numbers follow.
 */
function LinkAd({ runId, linked, candidates }: { runId: string; linked: AdHistory[]; candidates: AdHistory[] }) {
  if (linked.length === 0 && candidates.length === 0) return null;
  return (
    <div className="picks-run__link">
      {linked.map((r) => (
        <form key={r.id} action={linkAdToRunAction} className="picks-run__linked">
          <input type="hidden" name="run_id" value={runId} />
          <input type="hidden" name="ad_id" value={r.id} />
          <input type="hidden" name="unlink" value="1" />
          <span className="picks-run__stats">This is: {adLabel(r)}</span>
          <SubmitButton className="btn btn-ghost btn-xs" pendingLabel="…">
            Unlink
          </SubmitButton>
        </form>
      ))}
      {candidates.length > 0 && (
        <form action={linkAdToRunAction} className="picks-run__linkform">
          <input type="hidden" name="run_id" value={runId} />
          <label className="sr-only" htmlFor={`link-${runId}`}>
            Which ad in your account is this test
          </label>
          <select id={`link-${runId}`} name="ad_id" className="input" defaultValue="">
            <option value="" disabled>
              {linked.length > 0 ? "Add another ad from your account…" : "Which ad in your account is this test?"}
            </option>
            {candidates.slice(0, 60).map((r) => (
              <option key={r.id} value={r.id}>
                {adLabel(r)}
              </option>
            ))}
          </select>
          <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Linking…">
            Link
          </SubmitButton>
        </form>
      )}
    </div>
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
