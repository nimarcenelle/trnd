import Link from "next/link";

import AutoRefresh from "@/components/app/auto-refresh";
import PickPager from "@/components/app/pick-pager";
import ConceptActions from "@/components/picks/concept-actions";
import DetailCopyButton from "@/components/picks/detail-copy-button";
import { STATUS_LABEL, type ConceptView } from "@/lib/picks/concept-view";

/**
 * One creative test, whole, in the order a creator reads it: what we are
 * testing and why, then what to make, then the facts they may use, then how
 * the test will be judged, then the evidence with its limits. No grade, no
 * score: the priority is the rank and the reason under it.
 */

export interface ConceptHead {
  items: { href: string; term: string }[];
  index: number;
  weekRange: string;
  writing: number;
  deepening: boolean;
}

const KIND_LABEL: Record<string, string> = {
  observation: "Observed",
  quote: "Quoted",
  measurement: "Measured",
  context: "Context",
};

function day(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function ConceptDetail({ view, head, exportHref, refine }: { view: ConceptView; head: ConceptHead; exportHref: string; refine?: React.ReactNode }) {
  const status = STATUS_LABEL[view.status];
  return (
    <div className="page pickd cb">
      <section className="cb__head" aria-labelledby="cb-title">
        <div className="pickd__kicker">
          <span className="mono-label">
            Test {head.index + 1} · {head.weekRange}
          </span>
          <PickPager index={head.index} items={head.items} />
        </div>
        <h1 id="cb-title" className="pickd__title">
          {view.title}
        </h1>
        <div className="cb__chips">
          <span className={`badge${status.tone ? ` badge--${status.tone}` : ""}`} title={status.meaning}>
            <i />
            {status.label}
          </span>
          <span className="cb__basis" title={view.basis.kind === "builds_on" ? "Built on something you already ran." : "Nothing on file says you have tried this."}>
            {view.basis.label}
          </span>
          <span className="cb__format">{view.format}</span>
        </div>
        <p className="cb__status-meaning">{status.meaning}</p>
        {head.writing > 0 && (
          <p className="wk-more" role="status">
            <span className="wk-progress__mark is-live" aria-hidden="true" />
            The other {head.writing} concept{head.writing === 1 ? "" : "s"} land in a minute or two.
            <AutoRefresh everyMs={6000} times={30} />
          </p>
        )}
        {head.writing === 0 && head.deepening && (
          <p className="wk-more" role="status">
            <span className="wk-progress__mark is-live" aria-hidden="true" />
            This concept is from the fast reads. Your competitors&apos; ads and your own accounts are being read now, and the
            week is written again when they land.
            <AutoRefresh everyMs={20000} times={30} />
          </p>
        )}
        {view.refinedFrom && (
          <p className="cb__refined">
            Refined on {day(view.refinedFrom.at)}: &ldquo;{view.refinedFrom.ask}&rdquo;
          </p>
        )}
      </section>

      <section className="cb__grid">
        <div className="cb__main">
          <div className="pickd__card">
            <h2 className="pickd__h2">The customer situation</h2>
            <p className="cb__p">{view.situation}</p>
          </div>
          <div className="pickd__card cb__hypothesis">
            <h2 className="pickd__h2">The hypothesis</h2>
            <p className="cb__p">{view.hypothesis}</p>
            <p className="cb__label-note">A hypothesis, not a prediction. The test is how we find out.</p>
          </div>
          {view.lineage && (
            <div className="pickd__card">
              <h2 className="pickd__h2">Your own record on this shape</h2>
              <p className="cb__p">{view.lineage.line}</p>
              <p className="cb__label-note">
                Click-through only, from your ad history{view.lineage.latest ? `, the latest from ${day(view.lineage.latest)}` : ""}. Not purchase data.{" "}
                <Link href="/app/settings#ads" className="cb__link">
                  Your past ads
                </Link>
              </p>
            </div>
          )}
          {view.priorityReason && (
            <div className="pickd__card">
              <h2 className="pickd__h2">Why this is worth a test this week</h2>
              <p className="cb__p">{view.priorityReason}</p>
            </div>
          )}
          <div className="pickd__card cb__differs">
            <h2 className="pickd__h2">How it differs from your recent creative</h2>
            <p className="cb__p">{view.differsFrom}</p>
          </div>
        </div>
        <aside className="cb__side">
          <div className="pickd__card cb__unknowns">
            <h2 className="pickd__h2">What is uncertain or missing</h2>
            <ul className="cb__list">
              {view.unknowns.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
          {view.guardrail && (
            <aside className="pickd__guardrail" aria-labelledby="cb-guardrail">
              <h2 id="cb-guardrail" className="pickd__h2">
                Guardrail
              </h2>
              <p>{view.guardrail}</p>
            </aside>
          )}
        </aside>
      </section>

      <section className="cb__make" aria-labelledby="cb-make">
        <div className="cb__section-head">
          <h2 id="cb-make" className="pickd__h2">
            What to make
          </h2>
          <DetailCopyButton text={view.copyAll} label="Copy the brief" copiedLabel="Copied" />
        </div>
        <article className="card pickd__script">
          <p className="pickd__hook">
            <span className="pickd__k">Hook</span>
            {view.hooks.primary}
          </p>
          {view.hooks.alternatives.length > 0 && (
            <div className="cb__alts">
              <span className="pickd__k">Other openings for the same concept</span>
              <ul className="cb__list cb__list--tight">
                {view.hooks.alternatives.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          <dl className="pickd__direction">
            {(
              [
                ["Show", view.script.direction.show],
                ["Say", view.script.direction.say],
                ["Prove", view.script.direction.prove],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <footer className="pickd__script-foot">
            <span>
              <span className="pickd__k">Close</span>
              {view.script.cta}
            </span>
            <span className="pickd__runtime">about {view.script.duration_seconds}s</span>
          </footer>
        </article>
        <div className="cb__two">
          <div className="pickd__card">
            <h2 className="pickd__h2">Shot list</h2>
            <ol className="cb__shots">
              {view.shotList.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div className="pickd__card cb__facts">
            <h2 className="pickd__h2">Approved facts</h2>
            <p className="cb__label-note">Use these and nothing else. Each one is on your product pages, your catalog, your notes or the evidence below.</p>
            <ul className="cb__list">
              {view.approvedFacts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="cb__judge" aria-labelledby="cb-judge">
        <h2 id="cb-judge" className="pickd__h2">
          How to judge the test
        </h2>
        <div className="pickd__bet">
          <dl className="pickd__bet-rows">
            <div>
              <dt>Compare</dt>
              <dd>{view.evaluation.comparison}</dd>
            </div>
            <div>
              <dt>Budget</dt>
              <dd>{view.evaluation.budget}</dd>
            </div>
            <div>
              <dt>Watch</dt>
              <dd>
                <ol className="cb__list cb__list--tight">
                  {view.evaluation.watch.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ol>
              </dd>
            </div>
            {view.evaluation.caveats.length > 0 && (
              <div>
                <dt>Caveats</dt>
                <dd>
                  <ul className="cb__list cb__list--tight">
                    {view.evaluation.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {view.evaluation.missing.length > 0 && (
              <div className="cb__missing">
                <dt>Missing</dt>
                <dd>
                  <ul className="cb__list cb__list--tight">
                    {view.evaluation.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <Link href="/app/settings#ads" className="cb__link">
                    Add it in Settings
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="cb__outcomes">
          {(
            [
              ["If it does better", view.outcomes.if_better],
              ["If it does the same", view.outcomes.if_same],
              ["If it does worse", view.outcomes.if_worse],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="pickd__card">
              <h3 className="cb__h3">{k}</h3>
              <p className="cb__p cb__p--small">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <details className="pickd__why cb__evidence" open>
        <summary>
          The evidence, and what it cannot say · research input &ldquo;{view.researchTerm}&rdquo;
        </summary>
        <div className="pickd__groups">
          {view.evidence.map((g) => (
            <div key={g.signal} className="pickd__group">
              <h3>{g.label}</h3>
              <ul>
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <span className="cb__ev-kind">
                      {KIND_LABEL[r.kind] ?? r.kind}
                      {r.observedOn ? ` · ${day(r.observedOn)}` : ""}
                      {r.sampleSize !== null ? ` · n=${r.sampleSize}` : ""}
                    </span>
                    <span>{r.claim}</span>
                    {r.href ? (
                      <a href={r.href} target="_blank" rel="noopener noreferrer">
                        {r.sourceLabel}
                      </a>
                    ) : (
                      r.sourceLabel && <span className="cb__ev-src">{r.sourceLabel}</span>
                    )}
                    {r.limitation && <span className="cb__ev-limit">{r.limitation}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {view.evidence.length === 0 && <p className="cb__p cb__p--small">No evidence rows were stored with this concept.</p>}
        </div>
      </details>

      <ConceptActions pickId={view.id} copyText={view.copyAll} exportHref={exportHref} status={view.status} refine={refine} />
    </div>
  );
}
