import Link from "next/link";

import Brand from "@/components/brand";
import FullLanding from "@/components/landing/full-landing";
import CategoryRead from "@/components/read/category-read";
import { AdCard, GapCard, OpeningMix } from "@/components/read/parts";
import { PLAN_TIERS } from "@/lib/billing";
import { isPilotGated } from "@/lib/env";
import { FOCUS_MODE } from "@/lib/focus";
import { EXAMPLE_BRAND, EXAMPLE_RIVALS, exampleAds } from "@/lib/read/example";
import { findGap, summarizeAdvertiser } from "@/lib/read/gap";

import "./landing.css";
import "./read.css";

// The pitch: cheat off your competitors, because the Ad Library is public
// and their long-running ads are what they already paid to learn. It never
// means copying: the brief is written in the brand's own voice.
// The page is one input: a store's address, and a minute later the
// brand's category read back to it (lib/read/run.ts). Under the input sits
// a sample read of an invented brand, run through the same arithmetic, so
// a visitor sees what they get before they type. Every claim on the page is
// counted from a site and the public Ad Library, and says what it can't
// know. The full pitch page is kept behind FOCUS_MODE.

function SampleRead() {
  const ads = exampleAds();
  const own = summarizeAdvertiser(EXAMPLE_BRAND.name, EXAMPLE_BRAND.domain, ads[EXAMPLE_BRAND.name] ?? []);
  const rivals = EXAMPLE_RIVALS.map((r) => summarizeAdvertiser(r.name, r.domain, ads[r.name] ?? []));
  const gap = findGap(own, rivals);
  const shown = rivals.slice(0, 2).map((r) => ({ name: r.name, ad: r.top[0] }));
  return (
    <div className="rd-sample" aria-label="A sample read of an invented brand">
      <div className="rd-window">
        <div className="rd-window__bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>trnd · competitive read · {EXAMPLE_BRAND.domain}</span>
          <em>Sample</em>
        </div>
        <div className="rd-window__body">
          <GapCard gap={gap} />
          <div className="rd-sample__side">
            <div className="rd-panel rd-panel--tight">
              <span className="rd-kicker">How the ads open</span>
              <OpeningMix own={own} rivals={rivals} highlight={gap.opening} />
            </div>
            {shown.map((s) => (s.ad ? <AdCard key={s.name} ad={s.ad} advertiser={s.name} /> : null))}
          </div>
        </div>
      </div>
      <p className="rd-fine rd-sample__note">A sample read of an invented shower-filter brand. Yours reads your store and your real rivals.</p>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    h: "Name your real competitors",
    p: "From your store alone, we name the brands selling the same thing to your customer at your price. Every one checked to exist.",
  },
  {
    n: "02",
    h: "Read what they keep paying for",
    p: "Every ad they're running, sorted by how long it has survived on their budget. Losers get switched off. What's left is what they keep paying for.",
  },
  {
    n: "03",
    h: "Get the test to run",
    p: "The opening they lean on that you don't, and a brief in your voice a creator can shoot from. Never a copy of theirs.",
  },
];

const FIGURES = [
  { v: "~60s", l: "from URL to brief" },
  { v: "4", l: "rivals read, named for you" },
  { v: "30", l: "live ads a brand, by survival" },
  { v: "0", l: "logins or ad accounts" },
];

export default function Home() {
  if (!FOCUS_MODE) return <FullLanding />;
  return (
    <div className="rd">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
        precedence="default"
      />
      <div className="rd-atmos" aria-hidden="true" />

      <nav className="rd-nav">
        <Brand href={null} />
        <div className="rd-nav__links">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="rd-nav__right">
          <Link href="/login" className="rd-nav__signin">
            Sign in
          </Link>
          <a href="#read" className="rd-btn rd-btn--ghost rd-btn--sm">
            Free read
          </a>
        </div>
      </nav>

      <main>
        <header className="rd-hero" id="read">
          <span className="rd-pill">
            <i aria-hidden="true" /> Built on the public Meta Ad Library
          </span>
          <h1>
            Cheat off your competitors.
            <span className="rd-hero__answer">
              <em>They already paid to learn what works.</em>
            </span>
          </h1>
          <p className="rd-hero__sub">
            Your rivals spent months and real money finding out which ads work. Paste your store and see their answers in sixty seconds:
            what they keep paying for, the opening you&rsquo;re missing, and a test to beat them with.
          </p>
          <CategoryRead gated={isPilotGated} sample={<SampleRead />} />
        </header>

        <section className="rd-figures">
          {FIGURES.map((f) => (
            <div key={f.l}>
              <b>{f.v}</b>
              <span>{f.l}</span>
            </div>
          ))}
        </section>

        <section className="rd-section" id="how">
          <span className="rd-kicker rd-kicker--gold">How it works</span>
          <h2 className="rd-h2">
            They ran the tests. <em>You read the answers.</em>
          </h2>
          <div className="rd-steps">
            {STEPS.map((s) => (
              <div key={s.n} className="rd-step">
                <span className="rd-step__n">{s.n}</span>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
          <div className="rd-honest">
            <span className="rd-honest__stamp">The fine print</span>
            <p style={{ margin: 0 }}>
              <b>It&rsquo;s all public, and it&rsquo;s all yours.</b> Every ad we read is in the Meta Ad Library, open to anyone. We never copy
              an ad: we show you what&rsquo;s working for them and write a test that&rsquo;s yours. And we&rsquo;ll say it plainly: an ad still
              running after three weeks is one its brand keeps paying for. That&rsquo;s a strong hint, not proof, and every read says so.
            </p>
          </div>
        </section>

        <section className="rd-section" id="pricing">
          <span className="rd-kicker rd-kicker--gold">After the free read</span>
          <h2 className="rd-h2">
            Three tests every Monday. <em>A record of what won.</em>
          </h2>
          <div className="rd-plans">
            {PLAN_TIERS.map((t) => (
              <div key={t.id} className={`rd-plan${t.featured ? " rd-plan--featured" : ""}`}>
                {t.badge ? <span className="rd-plan__badge">{t.badge}</span> : null}
                <h3>{t.name}</h3>
                <p className="rd-plan__price">
                  {t.price.replace("/mo", "")}
                  <span>/month</span>
                </p>
                <p className="rd-soft">{t.who}</p>
                <ul>
                  {t.meter.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <a href="#read" className={`rd-btn ${t.featured ? "rd-btn--gold" : "rd-btn--ghost"}`}>
                  Start with a free read
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="rd-final">
          <h2 className="rd-h2">
            Everyone else is guessing. <em>You don&rsquo;t have to.</em>
          </h2>
          <a href="#read" className="rd-btn rd-btn--gold rd-btn--lg">
            Show me their answers →
          </a>
        </section>
      </main>

      <footer className="rd-footer">
        <Brand href={null} size={14} />
        <span>Know what to make next.</span>
        <span className="rd-footer__links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </span>
      </footer>
    </div>
  );
}
