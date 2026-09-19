import Brand from "@/components/brand";
import DetailCopyButton from "@/components/picks/detail-copy-button";
import type { ConceptView } from "@/lib/picks/concept-view";

/**
 * The brief as a creator reads it, without an account: what to make, the
 * facts they may use, how the test is judged. No decisions, no evidence
 * links into the app, nothing about the brand beyond its name.
 */
export default function SharedBrief({ view, brand }: { view: ConceptView; brand: string }) {
  const beats = view.opening?.beats ?? [];
  return (
    <div className="page pickd cb shared">
      <header className="shared__head">
        <Brand href="/" size={16} />
        <span className="mono-label">A creative test brief for {brand}</span>
      </header>
      <section className="cb__head">
        <h1 className="pickd__title">{view.title}</h1>
        <div className="cb__chips">
          <span className="cb__format">{view.format}</span>
        </div>
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
          <div className="pickd__card cb__differs">
            <h2 className="pickd__h2">How it differs from recent creative</h2>
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
            <aside className="pickd__guardrail">
              <h2 className="pickd__h2">Guardrail</h2>
              <p>{view.guardrail}</p>
            </aside>
          )}
        </aside>
      </section>

      <section className="cb__make">
        <div className="cb__section-head">
          <h2 className="pickd__h2">What to make</h2>
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
          {beats.length > 0 && (
            <div className="cb__opening">
              <span className="pickd__k">The first three seconds, shot by shot</span>
              <ol className="cb__beats">
                {beats.map((b, i) => (
                  <li key={i}>
                    <span className="cb__beat-visual">{b.visual}</span>
                    {b.on_screen_text && (
                      <span className="cb__beat-line">
                        <em>On screen:</em> {b.on_screen_text}
                      </span>
                    )}
                    {b.vo && (
                      <span className="cb__beat-line">
                        <em>Say:</em> {b.vo}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
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
            <p className="cb__label-note">Use these and nothing else.</p>
            <ul className="cb__list">
              {view.approvedFacts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="cb__judge">
        <h2 className="pickd__h2">How the test is judged</h2>
        <p className="cb__p">{view.evaluation.comparison}</p>
        <p className="cb__p">Budget: {view.evaluation.budget}</p>
        <p className="cb__p">Name the ad: {view.trackingName}</p>
      </section>
      <footer className="shared__foot mono-label">Written by TRND. Evidence and its limits are in the brand&apos;s workspace.</footer>
    </div>
  );
}
