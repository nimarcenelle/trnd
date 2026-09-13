import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import PickPager from "@/components/app/pick-pager";
import AlertBar from "@/components/picks/alert-bar";
import DetailActions from "@/components/picks/detail-actions";
import DetailCopyButton from "@/components/picks/detail-copy-button";
import DemandChart from "@/components/picks/demand-chart";
import SignalRead from "@/components/picks/signal-read";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { buildDetailView, isPickId, viewableDetail, type DetailSection, type DetailView } from "@/lib/picks/detail";
import { gradeTone, type GradeView } from "@/lib/picks/grade-view";
import { weekRangeLabel } from "@/lib/picks/list";
import { weekStillWriting } from "@/lib/picks/progress";
import { weekOf } from "@/lib/recommend/week";
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
  const [siblings, unreadAlerts, writing] = await Promise.all([
    repo.listReadyPicks(business.id, week),
    repo.listAlerts(business.id, { unreadOnly: true, limit: 5 }),
    weekStillWriting(repo, business),
  ]);
  const items = siblings.map((s) => ({ href: `/app/picks/${s.pick.id}`, term: sentenceCase(s.pick.term) }));
  const index = Math.max(0, siblings.findIndex((s) => s.pick.id === id));
  const head = { items, index, weekRange: weekRangeLabel(week), writing };

  const view = buildDetailView(detail);
  const render: Record<DetailSection, () => React.ReactNode> = {
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
      {view.sections.map((s) => render[s]())}
    </div>
  );
}

interface HeadContext {
  items: { href: string; term: string }[];
  index: number;
  weekRange: string;
  writing: number;
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
      <div className="pickd__top">
        <div className="pickd__col">
          {view.signalRead && <SignalRead read={view.signalRead} />}
          <Finding view={view} />
          {view.guardrail && <Guardrail text={view.guardrail} />}
        </div>
        <div className="pickd__col pickd__col--side">
          {view.grade && <GradeCard grade={view.grade} />}
          <Demand view={view} />
        </div>
      </div>
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

function GradeCard({ grade }: { grade: GradeView & { label: string } }) {
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
    </div>
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
