import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import DetailActions from "@/components/picks/detail-actions";
import DetailCopyButton from "@/components/picks/detail-copy-button";
import DetailSparkline from "@/components/picks/detail-sparkline";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { buildDetailView, isPickId, viewableDetail, type DetailSection, type DetailView } from "@/lib/picks/detail";

export const metadata = { title: "Pick — TRND" };

/**
 * One pick, whole: the finding, the bet, three scripts, the guardrail, why,
 * and the decision. Everything renders from the one getPickDetail read.
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
  if (!detail) notFound();

  const view = buildDetailView(detail);
  const render: Record<DetailSection, () => React.ReactNode> = {
    finding: () => <Finding key="finding" view={view} />,
    bet: () => <Bet key="bet" view={view} />,
    // The guardrail sits beside the scripts, so the two render as a pair.
    scripts: () => (
      <div key="scripts" className={`pickd__work${view.guardrail ? " pickd__work--guarded" : ""}`}>
        <Scripts view={view} />
        {view.guardrail && <Guardrail text={view.guardrail} />}
      </div>
    ),
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
      <Link href="/app/picks" className="mono-label pickd__back">
        All picks
      </Link>
      {view.sections.map((s) => render[s]())}
    </div>
  );
}

function Finding({ view }: { view: DetailView }) {
  const { metric } = view;
  return (
    <section className="pickd__finding" aria-labelledby="pickd-finding">
      <h1 id="pickd-finding" className="pickd__h1">
        {view.finding}
      </h1>
      <div className="pickd__metric">
        <div className="pickd__metric-text">
          <span className="pickd__metric-label">{metric.label}</span>
          <span className="pickd__metric-figures">
            {metric.value && <b className="pickd__metric-value">{metric.value}</b>}
            {metric.delta && <span className={`pickd__delta is-${metric.direction}`}>{metric.delta}</span>}
            <span className="pickd__metric-window">{metric.window}</span>
          </span>
        </div>
        <DetailSparkline points={metric.sparkline} label={metric.label} direction={metric.direction} />
      </div>
    </section>
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
            <footer className="pickd__script-foot">
              <span>
                <span className="pickd__k">CTA</span>
                {script.cta}
              </span>
              <span className="pickd__runtime">{script.duration_seconds}s</span>
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
          <section key={g.signal} className="pickd__group">
            <h3>{g.label}</h3>
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
          </section>
        ))}
      </div>
    </details>
  );
}
