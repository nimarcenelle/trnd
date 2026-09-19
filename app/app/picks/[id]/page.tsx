import "./pick-record.css";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import PickPager from "@/components/app/pick-pager";
import AlertBar from "@/components/picks/alert-bar";
import ConceptDetail from "@/components/picks/concept-detail";
import RefineForm from "@/components/picks/refine-form";
import DetailActions from "@/components/picks/detail-actions";
import DetailCopyButton from "@/components/picks/detail-copy-button";
import DemandChart from "@/components/picks/demand-chart";
import SignalRead from "@/components/picks/signal-read";
import WeekRead from "@/components/picks/week-read";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { buildConceptView } from "@/lib/picks/concept-view";
import { buildDetailView, isPickId, viewableDetail, type DetailSection, type DetailView } from "@/lib/picks/detail";
import { gradeTone, type GradeView } from "@/lib/picks/grade-view";
import { weekRangeLabel } from "@/lib/picks/list";
import { weekDeepening, weekStillWriting } from "@/lib/picks/progress";
import { readAdHistory } from "@/lib/ads/history-read";
import { notThisWeek, type DontCall } from "@/lib/record/calls";
import { buildTrackRecord, calibrationLine, gradeLetterOf, liftsForGrade } from "@/lib/record/track";
import { weekOf } from "@/lib/recommend/week";
import { benchmarkFor } from "@/lib/results/benchmarks";
import { storedWeekStrategy } from "@/lib/research/weekly";
import { isModelConfigured } from "@/lib/env";
import { normalizeTerm } from "@/lib/signals/normalize";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Pick — TRND" };

/**
 * One pick, whole. The head is the term, the Signal read and the finding on
 * the left with the grade and the demand read on the right, and the
 * guardrail under the finding; then the bet, the scripts, why, and the
 * decision. Everything renders from the one getPickDetail read.
 */
export default async function PickDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isPickId(id)) notFound();
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const detail = viewableDetail(await repo.getPickDetail(id), business.id);
  // The week's picks are rewritten under new ids when the rest of a fresh
  // week lands; a link to the old id goes back to the list, not to a 404.
  if (!detail) redirect("/app/picks");

  const week = weekOf();
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      console.warn("[pick] record read failed (non-fatal):", (err as Error).message);
      return fallback;
    }
  };
  const [siblings, unreadAlerts, writing, deepening, runs, skips, history, weekRead] = await Promise.all([
    repo.listReadyPicks(business.id, week),
    repo.listAlerts(business.id, { unreadOnly: true, limit: 5 }),
    weekStillWriting(repo, business),
    weekDeepening(repo, business).catch(() => false),
    safe(repo.listPickRuns(business.id), []),
    safe(repo.listWeekSkips(business.id, week), []),
    safe(repo.listAdHistory(business.id), []),
    safe(storedWeekStrategy(repo, business.id, week), null),
  ]);
  // The brand's own record decides how the grade is read: what this letter
  // has actually done here, and what not to run alongside this pick.
  const record = buildTrackRecord(runs, { accountCtr: readAdHistory(history).accountCtr, benchmarkCtr: benchmarkFor(business.category) });
  // Day one says nothing about the record: a line about runs that never
  // happened reads as a gap, not as honesty. It starts with the first run.
  const letter = gradeLetterOf(detail.pick);
  const calibration = { line: record.runs > 0 ? calibrationLine(record, letter, liftsForGrade(runs, letter)) : null, proven: record.scored > 0 };
  const dont = notThisWeek({ runs, skips: skips.filter((s) => s.normalized_term !== normalizeTerm(detail.pick.term)) });
  const items = siblings.map((s) => ({ href: `/app/picks/${s.pick.id}`, term: s.pick.concept_title ?? sentenceCase(s.pick.term) }));
  const index = Math.max(0, siblings.findIndex((s) => s.pick.id === id));
  const head = { items, index, weekRange: weekRangeLabel(week), writing, deepening, calibration };

  // A pick that carries a brief is a creative test and renders as one. A
  // pick written before the brief existed keeps the page it was written for.
  const concept = buildConceptView(detail);
  if (concept) {
    return (
      <>
        <AlertBar alerts={unreadAlerts} />
        {weekRead && (
          <div className="wread-wrap">
            <WeekRead read={weekRead} brand={business.name} />
          </div>
        )}
        <ConceptDetail
          view={concept}
          head={{ items, index, weekRange: weekRangeLabel(week), writing, deepening }}
          exportHref={`/app/picks/${detail.pick.id}/export`}
          refine={concept.status === "proposed" || concept.status === "chosen" ? <RefineForm pickId={detail.pick.id} modelReady={isModelConfigured} /> : undefined}
        />
      </>
    );
  }

  const view = buildDetailView(detail);
  // The "don't" half of the call sits between the work and the reasons.
  const sections: (DetailSection | "dont")[] = view.sections.flatMap((s) => (s === "why" || s === "actions" ? [] : [s]));
  if (dont.length > 0) sections.push("dont");
  for (const s of view.sections) if (s === "why" || s === "actions") sections.push(s);
  const render: Record<DetailSection | "dont", () => React.ReactNode> = {
    finding: () => <Head key="finding" view={view} head={head} />,
    bet: () => <Bet key="bet" view={view} />,
    scripts: () => (
      <div key="scripts" className="pickd__work">
        <Scripts view={view} />
      </div>
    ),
    // Rendered inside the head, under the finding.
    guardrail: () => null,
    why: () => <Why key="why" view={view} />,
    dont: () => <NotThisWeek key="dont" calls={dont} />,
    actions: () => (
      <DetailActions
        key="actions"
        pickId={detail.pick.id}
        copyText={view.copyAll}
        exportHref={`/app/picks/${detail.pick.id}/export`}
        mode={view.mode}
      />
    ),
  };

  return (
    <div className="page pickd">
      <AlertBar alerts={unreadAlerts} />
      {weekRead && <WeekRead read={weekRead} brand={business.name} />}
      {sections.map((s) => render[s]())}
    </div>
  );
}

interface HeadContext {
  items: { href: string; term: string }[];
  index: number;
  weekRange: string;
  writing: number;
  /** The deep read (rivals' ads, own accounts, short-form) is still running
   * behind a fresh signup's first picks; they are written again when it lands. */
  deepening: boolean;
  /** What this grade has done for this brand, and whether any run is scored. */
  calibration: { line: string | null; proven: boolean };
}

function Head({ view, head }: { view: DetailView; head: HeadContext }) {
  return (
    <section className="pickd__head" aria-labelledby="pickd-title">
      <div className="pickd__kicker">
        <span className="mono-label">
          Pick {head.index + 1} · {head.weekRange}
        </span>
        <PickPager index={head.index} items={head.items} />
      </div>
      <h1 id="pickd-title" className="pickd__title">
        {sentenceCase(view.term)}
      </h1>
      {head.writing > 0 && (
        <p className="wk-more" role="status">
          <span className="wk-progress__mark is-live" aria-hidden="true" />
          The other {head.writing} pick{head.writing === 1 ? "" : "s"} land in about a minute.
          <AutoRefresh everyMs={6000} times={30} />
        </p>
      )}
      {head.writing === 0 && head.deepening && (
        <p className="wk-more" role="status">
          <span className="wk-progress__mark is-live" aria-hidden="true" />
          This pick is from the fast reads. Your rivals&apos; ads, your own accounts and what&apos;s winning on short-form are
          being read now; the week is graded again when they land, in a few minutes.
          <AutoRefresh everyMs={20000} times={30} />
        </p>
      )}
      <Call view={view} />
      <div className="pickd__top">
        <div className="pickd__col">
          {view.signalRead && <SignalRead read={view.signalRead} />}
          <Finding view={view} />
          {view.guardrail && <Guardrail text={view.guardrail} />}
        </div>
        <div className="pickd__col pickd__col--side">
          {view.grade && <GradeCard grade={view.grade} calibration={head.calibration} />}
          <Demand view={view} />
        </div>
      </div>
    </section>
  );
}

function Call({ view }: { view: DetailView }) {
  const { call } = view;
  return (
    <section className="pickd__call" aria-labelledby="pickd-call">
      <h2 id="pickd-call" className="sr-only">
        The call
      </h2>
      <p className="pickd__call-sentence">{call.sentence}</p>
      {call.proofs.length > 0 && (
        <ul className="pickd__proofs">
          {call.proofs.map((p) => (
            <li key={p.id} className="pickd__proof">
              <span className="pickd__proof-claim">{p.claim}</span>
              {p.href && p.sourceLabel ? (
                <a className="pickd__proof-src" href={p.href} target="_blank" rel="noopener noreferrer">
                  {p.sourceLabel}
                </a>
              ) : (
                p.sourceLabel && <span className="pickd__proof-src">{p.sourceLabel}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Finding({ view }: { view: DetailView }) {
  return (
    <div className="pickd__card pickd__finding-card">
      <h2 className="pickd__h2">The finding</h2>
      <p>{view.finding}</p>
    </div>
  );
}

function GradeCard({ grade, calibration }: { grade: GradeView & { label: string }; calibration: HeadContext["calibration"] }) {
  return (
    <div className={`pickd__card pickd__grade-card is-${gradeTone(grade.letter)}`}>
      <h2 className="pickd__h2">Opportunity grade</h2>
      <div className="pickd__grade-row">
        <p className="pickd__grade-letter">
          <span className="sr-only">Grade </span>
          {grade.letter}
        </p>
        <div className="pickd__grade-text">
          <p className="pickd__grade-meaning">{grade.meaning}</p>
          {grade.score !== null && <p className="pickd__grade-score">{grade.score} of 100</p>}
        </div>
      </div>
      {grade.score !== null && (
        <span className="pickd__grade-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(2, Math.min(100, grade.score))}%` }} />
        </span>
      )}
      {grade.excludedNotes.length > 0 && (
        <ul className="pickd__excluded">
          {grade.excludedNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {calibration.line && (
        <p className="pickd__calibration">
          {calibration.line}
          {calibration.proven && (
            <>
              {" "}
              <Link href="/app/record">Track record</Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function NotThisWeek({ calls }: { calls: DontCall[] }) {
  if (calls.length === 0) return null;
  return (
    <section className="pickd__dont" aria-labelledby="pickd-dont">
      <h2 id="pickd-dont" className="pickd__h2">
        Not this week
      </h2>
      <ul className="pickd__dont-list">
        {calls.map((c) => (
          <li key={c.key} className={`pickd__dont-row${c.kind === "run_due" ? " is-due" : ""}`}>
            <p className="pickd__dont-term">{sentenceCase(c.term)}</p>
            {c.grade && <span className="pickd__dont-grade">{c.kind === "run_due" ? "Running" : c.grade}</span>}
            <p className="pickd__dont-line">
              {c.line}
              {c.href && (
                <>
                  {" "}
                  <Link href={c.href}>{c.kind === "run_due" ? "Open the run" : "See why"}</Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Demand({ view }: { view: DetailView }) {
  const { metric } = view;
  const lead = view.demandDeltas[0];
  // The line is the brand's mint unless demand is actually falling: a flat
  // week in grey read as a warning it was not.
  const tone = lead?.direction === "down" ? "down" : "up";
  // An interest index has no level to print (a Trends "63" is relative to its
  // own peak), so the lead change stands in the value slot and its window
  // becomes the chip; a dash under a heading is a gap, not a number.
  const arrowOf = (d: "up" | "down" | "flat") => (d === "up" ? "↑" : d === "down" ? "↓" : "→");
  const leadAsValue = metric.value === null && lead !== undefined;
  const value = metric.value ?? (lead ? `${arrowOf(lead.direction)}${Math.abs(lead.pct)}%` : null);
  return (
    <div className="pickd__card pickd__demand">
      <h2 className="pickd__h2">{metric.label}</h2>
      <div className="pickd__demand-row">
        {value !== null && <p className={`pickd__demand-value${leadAsValue ? ` is-${lead.direction}` : ""}`}>{value}</p>}
        <div className="pickd__chips">
          {view.demandDeltas.length > 0 ? (
            view.demandDeltas.map((d, i) =>
              leadAsValue && i === 0 ? (
                <span key={d.window} className="pickd__chip">
                  {d.window}
                </span>
              ) : (
                <span key={d.window} className={`pickd__chip is-${d.direction}`}>
                  <span aria-hidden="true">{arrowOf(d.direction)}</span>
                  {Math.abs(d.pct)}% {d.window}
                </span>
              ),
            )
          ) : (
            <span className="pickd__chip">{metric.window}</span>
          )}
        </div>
      </div>
      <DemandChart points={metric.sparkline} label={metric.label} tone={tone} />
      <p className="pickd__demand-explainer">{view.demandExplainer}</p>
    </div>
  );
}

function Bet({ view }: { view: DetailView }) {
  const rows: [string, string][] = [
    ["What to run", view.bet.what],
    ["Budget", view.bet.budget],
    ["Duration", view.bet.duration],
    ["Kill rule", view.bet.killRule],
  ];
  return (
    <section className="pickd__bet" aria-labelledby="pickd-bet">
      <h2 id="pickd-bet" className="pickd__h2">
        The bet
      </h2>
      <dl className="pickd__bet-rows">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Scripts({ view }: { view: DetailView }) {
  return (
    <section className="pickd__scripts" aria-labelledby="pickd-scripts">
      <h2 id="pickd-scripts" className="pickd__h2">
        Scripts
      </h2>
      <div className="pickd__script-list">
        {view.scripts.map(({ script, text }) => (
          <article key={script.id} className="card pickd__script">
            <header className="pickd__script-head">
              <div>
                <p className="pickd__variant">{script.variant_label}</p>
                <p className="pickd__thesis">{script.thesis}</p>
              </div>
              <DetailCopyButton text={text} ariaLabel={`Copy script ${script.variant_label}`} />
            </header>
            <p className="pickd__hook">
              <span className="pickd__k">Hook</span>
              {script.hook}
            </p>
            {script.direction ? (
              <dl className="pickd__direction">
                {(
                  [
                    ["Show", script.direction.show],
                    ["Say", script.direction.say],
                    ["Prove", script.direction.prove],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ol className="pickd__beats">
                {script.beats.map((b, i) => (
                  <li key={i} className="pickd__beat">
                    <dl>
                      <div>
                        <dt>Visual</dt>
                        <dd>{b.visual}</dd>
                      </div>
                      {b.on_screen_text && (
                        <div>
                          <dt>On screen</dt>
                          <dd>{b.on_screen_text}</dd>
                        </div>
                      )}
                      {b.vo && (
                        <div>
                          <dt>Voiceover</dt>
                          <dd>{b.vo}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
            <footer className="pickd__script-foot">
              <span>
                <span className="pickd__k">Close</span>
                {script.cta}
              </span>
              <span className="pickd__runtime">about {script.duration_seconds}s</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function Guardrail({ text }: { text: string }) {
  return (
    <aside className="pickd__guardrail" aria-labelledby="pickd-guardrail">
      <h2 id="pickd-guardrail" className="pickd__h2">
        Guardrail
      </h2>
      <p>{text}</p>
    </aside>
  );
}

function Why({ view }: { view: DetailView }) {
  return (
    <details className="pickd__why">
      <summary>Why this pick</summary>
      <div className="pickd__groups">
        {view.groups.map((g) => (
          <section key={g.signal} className={`pickd__group${g.header?.kind === "gap" ? " is-gap" : ""}`}>
            <h3>{g.header?.text ?? g.label}</h3>
            {g.header?.kind === "gap" && g.header.cta && (
              <Link href={g.header.cta.href} className="pickd__group-cta">
                {g.header.cta.label}
              </Link>
            )}
            {g.components.length > 0 && (
              <ul className="pickd__components">
                {g.components.map((c) => (
                  <li key={c.key}>{c.text}</li>
                ))}
              </ul>
            )}
            {g.claims.length > 0 && (
            <ul>
              {g.claims.map((c) => (
                <li key={c.id}>
                  <span>{c.claim}</span>
                  {c.href && (
                    <a href={c.href} target="_blank" rel="noopener noreferrer">
                      {c.sourceLabel}
                    </a>
                  )}
                </li>
              ))}
            </ul>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
