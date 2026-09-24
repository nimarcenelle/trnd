import { BASELINE_FEATURES, PLAN_TIERS } from "@/lib/billing";
import Link from "next/link";

import PilotForm from "@/components/landing/pilot-form";
import FloatingCta from "@/components/landing/floating-cta";
import { IcoCheck, IcoX } from "@/components/landing/icons";
import RevealObserver from "@/components/landing/reveal-observer";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

// Styles: app/landing.css, imported by the page that renders this.

// The page speaks to one buyer: a founder or growth marketer at a DTC brand
// that already runs Meta ads, makes creative regularly, and is stuck on what
// to make next. It promises briefs and evidence, never winners. Nothing on
// it is a customer, a number or a result TRND has not earned; the example
// brief is invented and says so.

const OLD_WAY = [
  "Scroll TikTok and Instagram for an hour and call it research.",
  "Screenshot competitors' ads and guess which ones are working.",
  "Search Reddit for what customers complain about.",
  "Brief the next batch from memory and hope it is different from the last one.",
];
const TRND_WAY = [
  "Up to three creative test briefs a week, each a hypothesis with its evidence and its limits.",
  "Competitors' ads and posts read weekly and quoted as observed, not as proof.",
  "Every ad you ever ran, classified by angle, so the record starts on day one.",
  "Each finished ad checked against its brief, so a loss says whether the idea or the shoot lost.",
];

const INPUTS = [
  {
    stat: "YOUR RESULTS",
    name: "What you already ran",
    cat: "An Ads Manager export gives each brief a reference ad and your own baseline. No export, and the week says it is research only.",
  },
  {
    stat: "YOUR CUSTOMERS",
    name: "What they say, in their words",
    cat: "Reviews, comments and the questions people search. Quoted as written, with the sample size beside them.",
  },
  {
    stat: "COMPETITORS",
    name: "What they are actually running",
    cat: "Their ads and posts, read as observed on a date. Running says nothing about whether it works, and the brief says so.",
  },
  {
    stat: "SEARCH",
    name: "Context, not prediction",
    cat: "What people search for and when. Demand context for a concept, never a forecast of how a paid-social ad will do.",
  },
];

const LOOP = [
  { n: "01", h: "Research", p: "Your results, your customers' words, your competitors' ads and search, read every week." },
  { n: "02", h: "Concepts", p: "Up to three distinct creative tests, in priority order, with the reason each is worth a test now." },
  { n: "03", h: "Brief", p: "The hook, the direction, the shot list and the facts a creator may use. Copy it or export it." },
  { n: "04", h: "Decide", p: "Choose it, refine it, or pass with a reason. A pass is a decision, not a result." },
  { n: "05", h: "Judge", p: "A plan for the test built from your objective and your own baseline, and the finished ad checked against the brief." },
  { n: "06", h: "Learn", p: "What you launched and what it taught shapes the next week, and the record shows it, in public. The topic is never banned by one execution." },
];

/** An example brief in the shape the app writes. The brand and every
 * figure are invented, and the frame says so. */
function HeroBrief() {
  return (
    <div className="pframe hero__pick" role="group" aria-label="An example creative test brief, invented for this page">
      <div className="pframe__bar">
        <i />
        <i />
        <i />
        <span>Example · an invented brand</span>
      </div>
      <div className="hpick">
        <div className="hpick__main">
          <div className="hpick__top">
            <span className="pframe__eyebrow">Test 1 of 3 · Explores new ground</span>
          </div>
          <h2 className="hpick__title">The towel that slips</h2>
          <p className="hpick__finding">
            <b>Hypothesis.</b> Test whether showing the frustration of a wet bath towel slipping off is more persuasive than
            leading with the hair towel&apos;s material, because customers describe the problem before they describe the fix.
          </p>
          <dl className="hpick__bet">
            <div>
              <dt>Hook</dt>
              <dd>&ldquo;Third time it fell off while I did my skincare&rdquo;</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>20-second talking head, one phone, bathroom light</dd>
            </div>
            <div>
              <dt>Judge it</dt>
              <dd>Beside your current best ad, same ad set, same budget. Read under 50 purchases as directional.</dd>
            </div>
          </dl>
        </div>
        <div className="hpick__side">
          <span className="pframe__eyebrow">The evidence, and its limits</span>
          <ol className="hpick__hooks">
            <li>
              Quoted · 4 of 31 comments under your posts mention the towel slipping.
              <small>A handful of people, not the audience.</small>
            </li>
            <li>
              Observed · A rival&apos;s ad on absorbency was running when read.
              <small>Running does not mean it works.</small>
            </li>
            <li>
              Missing · No ad results on file yet.
              <small>Nothing here is checked against what worked for you.</small>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function FullLanding() {
  return (
    <>
      <RevealObserver />
      <FloatingCta />
      <nav className="nav">
        <a className="inline-flex" href="#top" aria-label="TRND — top">
          <Brand href={null} />
        </a>
        <div className="nav__links">
          <a href="#problem">The Monday problem</a>
          <a href="#inputs">Honest evidence</a>
          <a href="#how">How it works</a>
          <Link href="/record">The record</Link>
          <a href="#pilot">Plans</a>
        </div>
        <div className="nav__right">
          <Link className="font-body text-[14px] text-ink-soft" href="/login">
            Sign in
          </Link>
          <ThemeToggle />
          <a href="#pilot" className="btn btn-primary btn-sm">
            Apply for the pilot
          </a>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero__texture" />
        <div className="wrap hero__inner">
          <div className="eyebrow">The weekly creative test agenda for DTC brands on Meta</div>
          <h1>
            Know what <em>to make next.</em>
          </h1>
          <p className="hero__sub">
            Not a dashboard. Not an ad generator. Every Monday, up to three creative tests worth running, each a brief a creator
            can shoot from, with the evidence behind it and what that evidence cannot say. Then a record of what happened, in
            public.
          </p>
          <div className="hero__ctas">
            <a href="#pilot" className="btn btn-primary">
              Apply for the pilot
            </a>
            <a href="#how" className="btn btn-ghost">
              How it works
            </a>
          </div>
          <div className="hero__proof">
            <span className="pill">The decision, not more data</span>
            <span className="pill">Every brief shows what the evidence cannot say</span>
            <span className="pill">The track record is public</span>
          </div>
          <HeroBrief />
        </div>
      </header>

      <hr className="rule" />

      <section className="block" id="problem">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">The Monday problem</span>
            <h2>Someone says &ldquo;let&rsquo;s try a UGC one.&rdquo; Nobody can say why.</h2>
            <p>
              The research is out there, in comment sections, ad libraries, reviews and your own account. What is missing
              is the hours to read it and the discipline to turn it into a brief with a reason. So the next batch gets
              briefed from memory, the creator fills the gaps, and when it loses nobody knows whether the idea or the shoot
              lost. The enemy is not another tool. It is guesswork with a budget.
            </p>
          </div>
          <div className="chipband reveal">
            <span>Beauty</span>
            <span>Personal care</span>
            <span>Wellness</span>
            <span>Home</span>
            <span>Apparel</span>
          </div>

          <div className="h-[56px]" />

          <div className="split reveal">
            <div className="split__col">
              <div className="split__title">How the next brief gets written today</div>
              {OLD_WAY.map((t) => (
                <div className="split__row" key={t}>
                  <IcoX />
                  {t}
                </div>
              ))}
            </div>
            <div className="split__col now">
              <div className="split__title">With TRND</div>
              {TRND_WAY.map((t) => (
                <div className="split__row" key={t}>
                  <IcoCheck />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="inputs">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Honest evidence</span>
            <h2>Every brief shows what the evidence cannot say.</h2>
            <p>
              Marketing software is distrusted because it sounds certain. A TRND brief separates what was observed from what
              we think may work. Facts trace to your catalog, your notes or a source you can open. Judgments are labeled as
              hypotheses. Numbers are never invented, and a threshold is never made up. In this category, restraint is the
              expertise.
            </p>
          </div>
          <div className="signals reveal">
            {INPUTS.map((c) => (
              <div className="sig-card" key={c.stat}>
                <div className="sig-card__stat">{c.stat}</div>
                <div className="sig-card__name">{c.name}</div>
                <div className="sig-card__desc">{c.cat}</div>
              </div>
            ))}
          </div>
          <p className="model-line reveal">
            Observed <span>+</span> Quoted <span>+</span> Your results <span>=</span> <strong>A hypothesis worth a test</strong>
          </p>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="how">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">The week</span>
            <h2>Not more information. The next brief.</h2>
            <p>
              Ad libraries and creative analytics tell you what happened and what rivals are running. Nobody sells the
              decision. TRND carries the research to a brief a creator can shoot from, checks the ad against it, keeps
              score in public, and keeps what you learned for the next one.
            </p>
          </div>
          <div className="fly__list loop reveal">
            {LOOP.map((f) => (
              <div className="fly__item" key={f.n}>
                <span className="fly__num">{f.n}</span>
                <div>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="pilot">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">The pilot</span>
            <h2>Priced on access. Metered on briefs, rivals and seats.</h2>
            <p>
              Every plan carries the whole product: your account classified by angle, your rivals&apos; ads read weekly, the
              brief, the check against it, the record. The tiers differ in how many briefs a week, how many rivals and how
              many people. New brands start with the pilot: one month on the TRND tier, the founder reading every brief, and
              at the end you decide whether to keep going. Founding brands lock their price for a year.
            </p>
          </div>

          <div className="tiers reveal">
            {PLAN_TIERS.map((t) => (
              <div key={t.id} className={`tier${t.featured ? " tier--featured" : ""}`}>
                {t.badge && <span className="tier__badge">{t.badge}</span>}
                <h3 className="tier__name">{t.name}</h3>
                <div className="tier__price">
                  {t.price.replace("/mo", "")}
                  <small>/ MONTH</small>
                </div>
                <p className="tier__promise">{t.who}</p>
                <div className="tier__list">
                  {t.meter.map((f) => (
                    <div key={f}>
                      <IcoCheck />
                      {f}
                    </div>
                  ))}
                  {t.featured &&
                    BASELINE_FEATURES.map((f) => (
                      <div key={f}>
                        <IcoCheck />
                        {f}
                      </div>
                    ))}
                </div>
                <a href="#apply" className={`btn ${t.featured ? "btn-primary" : "btn-ghost"} justify-center`}>
                  {t.featured ? "Apply for the pilot" : "Apply"}
                </a>
                <span className="tier__foot">{t.featured ? "The pilot runs on this tier, with the founder reading every brief for a month." : `${t.annual} billed yearly.`}</span>
              </div>
            ))}
          </div>

          <p className="founding-note reveal">
            Briefs are hypotheses, not winners. TRND does not promise results, return on ad spend, or a replacement for your
            strategist. It promises less research, specific ideas, production instructions, a reason for each test, and
            continuity between what you tested and what comes next.
          </p>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="apply">
        <div className="wrap">
          <div className="demo reveal">
            <div className="demo__copy">
              <span className="eyebrow">Apply</span>
              <h2>Tell us what you make and what you are stuck on.</h2>
              <p>
                The pilot is for a brand that already runs Meta ads, makes creative regularly, has someone who can produce
                it, and can share recent results. If that is you, apply. We read every application and reply by email.
              </p>
              <div className="demo__bullets">
                <div>
                  <IcoCheck />
                  What you get: up to three briefs a week, founder-reviewed
                </div>
                <div>
                  <IcoCheck />
                  What you supply: an export, your product facts, a creator
                </div>
                <div>
                  <IcoCheck />
                  What we will not claim: winners, guaranteed lift, or a finished strategy
                </div>
              </div>
            </div>
            <div className="demo__form">
              <PilotForm />
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <div className="mb-3">
                <Brand href={null} size={18} />
              </div>
              <p className="tagline">Weekly creative test briefs for DTC brands. usetrnd.com</p>
            </div>
            <div className="foot-links">
              <div className="foot-col">
                <h3>Product</h3>
                <a href="#problem">Problem</a>
                <a href="#inputs">What it reads</a>
                <a href="#how">How it works</a>
              </div>
              <div className="foot-col">
                <h3>Company</h3>
                <a href="#pilot">The pilot</a>
                <a href="#apply">Apply</a>
              </div>
              <div className="foot-col">
                <h3>Legal</h3>
                <Link href="/terms">Terms of Service</Link>
                <Link href="/privacy">Privacy Policy</Link>
                <a className="foot-yt" href="https://www.youtube.com" target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 28 20" width="22" height="16" aria-hidden="true">
                    <path
                      d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5c.6-2.2.6-6.9.6-6.9s0-4.7-.6-6.9Z"
                      fill="#FF0000"
                    />
                    <path d="M11.2 14.3 18.4 10l-7.2-4.3v8.6Z" fill="#fff" />
                  </svg>
                  Uses YouTube API Services
                </a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 TRND</span>
            <span>The example brief on this page is invented. No customer, result or figure on it is real.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
