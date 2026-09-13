import { BASELINE_FEATURES } from "@/lib/billing";
import Link from "next/link";

import DemoForm from "@/components/landing/demo-form";
import FloatingCta from "@/components/landing/floating-cta";
import { IcoCheck, IcoX } from "@/components/landing/icons";
import RevealObserver from "@/components/landing/reveal-observer";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";

import "./landing.css";

// The page speaks to one buyer: the growth team at a DTC brand that already
// spends real money on paid social. Every block answers the question they
// actually have ("what ad do we make next?"), and nothing on it is a number
// or a customer TRND hasn't earned. The shared landing components that still
// carry the old local-shop copy (Ticker, Steps, ProductFrame) are left out
// rather than contradicting the page around them.

const OLD_WAY = [
  "Scroll TikTok and Instagram for an hour and call it research.",
  "Screenshot competitors' ads and guess which ones are working.",
  "Search Reddit for what customers complain about.",
  "Brief the next batch on gut instinct and hope the hit rate holds.",
];
const TRND_WAY = [
  "One call each week on the ad to run next, with the reasons.",
  "Competitors' ads and posts read daily, saturated angles flagged.",
  "Your customers' own words pulled into the hook.",
  "Your ad account's results fed into next week's call.",
];

const SIGNALS = [
  {
    stat: "CUSTOMER",
    name: "Who you're trying to reach, and what they're telling you",
    cat: "Conversations, pain points, interests and sentiment from the places your customers post, search and review.",
  },
  {
    stat: "CULTURE",
    name: "What's changing around your category",
    cat: "Rising searches, TikTok and Shorts formats that are climbing, and the dates your category moves on.",
  },
  {
    stat: "COMPETITIVE",
    name: "What your competitors are running",
    cat: "Their Meta and TikTok ads and posts, what they keep saying, what's saturated, and where the whitespace is.",
  },
  {
    stat: "BRAND",
    name: "What works for you specifically",
    cat: "Learned from your ad history and creative performance, so the call gets sharper every week you run.",
  },
];

const LOOP = [
  { n: "01", h: "Signals", p: "Customer, culture, competition and your brand, rebuilt every day." },
  { n: "02", h: "Opportunity", p: "The one opening worth an ad this week, graded, with every number linked to its source." },
  { n: "03", h: "Decision", p: "What to advertise, who to reach, why now, and how to execute it." },
  { n: "04", h: "Creative", p: "The angle, the format and three scripts your team or creators can shoot." },
  { n: "05", h: "Performance", p: "Results read from your Meta ad account or your exports." },
  { n: "06", h: "Learning", p: "What won feeds the next call, so your hit rate climbs instead of resetting." },
];

// The sample is labeled as an example on the page and in the footer. The
// shape is exactly what the weekly call returns; the brand is invented.
const SAMPLE_WHY = [
  "Searches for “dark spots after acne” are up week over week, with the rise linked to its source.",
  "Your three closest competitors are all running routine videos. None show a result on camera.",
  "Your own best ad last quarter was a close-up demo, not a lifestyle shot.",
];
const SAMPLE_SCRIPTS = [
  "Close-up of the mark, day one. Same mark, day 28. No voiceover, just the dates on screen.",
  "“I tried four serums for this. Here’s the one I finished.” Creator to camera, 20 seconds.",
  "The ingredient list next to the $12 drugstore version, and what the difference does.",
];

export default function Home() {
  return (
    <>
      <RevealObserver />
      <FloatingCta />
      <nav className="nav">
        <a className="inline-flex" href="#top" aria-label="TRND — top">
          <Brand href={null} />
        </a>
        <div className="nav__links">
          <a href="#problem">Problem</a>
          <a href="#signals">Signals</a>
          <a href="#sample">The call</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="nav__right">
          <Link className="font-body text-[14px] text-ink-soft" href="/login">
            Sign in
          </Link>
          <ThemeToggle />
          <Link href="/signup" className="btn btn-primary btn-sm">
            Start free
          </Link>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero__texture" />
        <div className="wrap hero__inner">
          <div className="eyebrow">For growth teams at DTC brands</div>
          <h1>
            Know what to advertise <em>before your competitors do.</em>
          </h1>
          <p className="hero__sub">
            TRND is an AI creative strategist for brands where paid social drives growth. Every
            week it reads your customers, your category, your competitors and your own ad results,
            and tells you the next ad to make: the product, the audience, the angle, the format,
            and three scripts to test.
          </p>
          <div className="hero__ctas">
            <Link href="/signup" className="btn btn-primary">
              Start free
            </Link>
            <a href="#demo" className="btn btn-ghost">
              Request a demo
            </a>
          </div>
          <div className="hero__proof">
            <span className="pill">Meta, TikTok and Instagram</span>
            <span className="pill">A new call every week</span>
            <span className="pill">One plan, $500 a month</span>
          </div>
        </div>
      </header>

      <hr className="rule" />

      <section className="block" id="problem">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">The problem</span>
            <h2>You spend tens of thousands a month on ads. Picking the next one is still a guess.</h2>
            <p>
              The answer is out there, in comment sections, ad libraries, Reddit threads and your own
              account. What&apos;s missing is the layer that turns all of it into a decision. So the
              next ad gets picked by scrolling, screenshots and gut instinct.
            </p>
          </div>
          <div className="chipband reveal">
            <span>Beauty</span>
            <span>Fashion</span>
            <span>Wellness</span>
            <span>Food &amp; beverage</span>
            <span>Lifestyle</span>
          </div>

          <div className="h-[56px]" />

          <div className="split reveal">
            <div className="split__col">
              <div className="split__title">How the next ad gets picked today</div>
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

      <section className="block" id="signals">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Four signals</span>
            <h2>Built every day, for your brand.</h2>
            <p>
              Customer, culture, competition and your own results. Each one is useful alone. The
              decision comes from reading them together.
            </p>
          </div>
          <div className="signals reveal">
            {SIGNALS.map((c) => (
              <div className="sig-card" key={c.stat}>
                <div className="sig-card__stat">{c.stat}</div>
                <div className="sig-card__name">{c.name}</div>
                <div className="sig-card__desc">{c.cat}</div>
              </div>
            ))}
          </div>
          <p className="model-line reveal">
            Customer <span>&times;</span> Culture <span>&times;</span> Competition{" "}
            <span>&times;</span> Brand <span>=</span> <strong>Next Best Ad</strong>
          </p>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="how">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">The loop</span>
            <h2>Not more information. The next decision.</h2>
            <p>
              Most tools stop at data and leave the marketer to figure it out. TRND carries it all
              the way to the ad, then learns from how the ad did.
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

      <section className="block" id="sample">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Example</span>
            <h2>What the weekly call looks like.</h2>
            <p>An illustrative brand. Yours is built from your products, customers and competitors.</p>
          </div>
          <div className="pframe reveal" role="group" aria-label="An example of TRND's weekly ad call">
            <div className="pframe__bar">
              <i />
              <i />
              <i />
              <span>Example · this week</span>
            </div>
            <div className="sample">
              <div>
                <span className="pframe__eyebrow">Run this ad</span>
                <div className="pframe__title">
                  Promote the vitamin C serum to women 25 to 40 fighting post-acne marks, on TikTok
                  and Reels.
                </div>
                <dl className="sample__facts">
                  <div>
                    <dt>Angle</dt>
                    <dd>Proof over promise. Show the mark fading, not the routine.</dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>20-second creator close-up, one take, dates on screen.</dd>
                  </div>
                </dl>
              </div>
              <div>
                <span className="pframe__eyebrow">Why</span>
                <ul className="sample__list">
                  {SAMPLE_WHY.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <span className="pframe__eyebrow">Three scripts to test</span>
                <ol className="sample__list">
                  {SAMPLE_SCRIPTS.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="pricing">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Pricing</span>
            <h2>One plan. $500 a month.</h2>
            <p>
              A brand spending $50,000 a month on paid social isn&apos;t worried about $500. It&apos;s
              worried about putting $50,000 behind a mediocre ad. TRND helps you find winners faster,
              raise your creative hit rate, spot openings before competitors do, and cut the hours
              and media spend that go into ads that lose. One extra winning ad pays for it many
              times over.
            </p>
          </div>

          <div className="tiers reveal">
            <div className="tier tier--featured">
              <span className="tier__badge">TRND</span>
              <h3 className="tier__name">TRND</h3>
              <div className="tier__price">
                $500<small>/ MO</small>
              </div>
              <p className="tier__promise">
                Every week: the next ad to run, and why. Or $5,000 a year, two months free.
              </p>
              <div className="tier__list">
                {BASELINE_FEATURES.map((f) => (
                  <div key={f}><IcoCheck />{f}</div>
                ))}
              </div>
              <Link href="/signup" className="btn btn-primary justify-center">
                Start free
              </Link>
              <span className="tier__foot">14-day trial. No card required. Cancel anytime.</span>
            </div>
          </div>

          <p className="founding-note reveal">
            Founding brands lock their price. The ads TRND wrote for you are yours.{" "}
            <a href="#demo">Talk to us.</a>
          </p>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="demo">
        <div className="wrap">
          <div className="demo reveal">
            <div className="demo__copy">
              <span className="eyebrow">Request a demo</span>
              <h2>See the ad TRND would tell you to run next.</h2>
              <p>
                Drop your website and we&apos;ll come to the call with a live example already built
                from your products, your customers and the competitors you actually face. Not a deck
                about brands like yours. A call for yours.
              </p>
              <div className="demo__bullets">
                <div>
                  <IcoCheck />
                  20-minute call, no slide deck
                </div>
                <div>
                  <IcoCheck />A real next-ad call for your brand
                </div>
                <div>
                  <IcoCheck />
                  Straight answer on pricing, no follow-up chase
                </div>
              </div>
            </div>
            <div className="demo__form">
              <DemoForm />
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
              <p className="tagline">The AI creative strategist for DTC brands. usetrnd.com</p>
            </div>
            <div className="foot-links">
              <div className="foot-col">
                <h3>Product</h3>
                <a href="#problem">Problem</a>
                <a href="#signals">Four signals</a>
                <a href="#sample">The weekly call</a>
              </div>
              <div className="foot-col">
                <h3>Company</h3>
                <a href="#pricing">Pricing</a>
                <a href="#demo">Request a demo</a>
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
            <span>Examples on this page are illustrative.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
