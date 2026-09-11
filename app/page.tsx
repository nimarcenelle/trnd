import { BASELINE_FEATURES } from "@/lib/billing";
import Link from "next/link";

import DemoForm from "@/components/landing/demo-form";
import FloatingCta from "@/components/landing/floating-cta";
import ProductFrame from "@/components/landing/product-frame";
import { IcoCheck, IcoX } from "@/components/landing/icons";
import RevealObserver from "@/components/landing/reveal-observer";
import Brand from "@/components/brand";
import Steps from "@/components/landing/steps";
import Ticker from "@/components/landing/ticker";
import ThemeToggle from "@/components/theme-toggle";

import "./landing.css";

const OLD_WAY = [
  "Guess what to post and hope it lands.",
  "Hire an agency, wait weeks for a plan.",
  "Generic AI copy that sounds like everyone else's.",
  "Find out it flopped next quarter's report.",
];
const TRND_WAY = [
  "Know what's moving before you spend a dollar.",
  "Get a finished ad every Monday.",
  "Positioning built from what's actually converting for businesses like yours.",
  "See what worked, fed straight into next week's plan.",
];

const SIG_CARDS = [
  { path: "M2 26 L16 24 L30 20 L44 22 L58 10 L72 14 L88 4", stat: "↑34% search interest", name: "Iced latte alternatives", cat: "COFFEE SHOPS & CAFÉS" },
  { path: "M2 22 L16 24 L30 18 L44 20 L58 12 L72 8 L88 2", stat: "↑27% booking intent", name: "Same-day appointments", cat: "HOME SERVICES" },
  { path: "M2 28 L16 20 L30 22 L44 12 L58 14 L72 6 L88 8", stat: "↑48% conversation", name: "Recovery & wellness add-ons", cat: "FITNESS STUDIOS" },
  { path: "M2 24 L16 22 L30 24 L44 16 L58 18 L72 10 L88 12", stat: "↑22% local demand", name: "Weekend brunch reservations", cat: "RESTAURANTS" },
];

const FLY_ITEMS = [
  { n: "01", h: "TRND reads your business on day one", p: "Your services, prices, neighborhood, and voice become the founding analysis every recommendation is judged against." },
  { n: "02", h: "Your campaigns run in the real world", p: "Clicks, bookings, cost per result — a one-minute entry after each flight, or synced from your ad account when you connect it." },
  { n: "03", h: "The model learns what converts for you", p: "Not in general — for your offer, your price point, your neighborhood." },
  { n: "04", h: "Next week's recommendation is sharper", p: "Built on everything TRND now knows about your business that it didn't last week." },
];

const ROADMAP = [
  { status: "● live", live: true, n: "Phase 1", t: "Ad campaigns", d: "Demand detection and a finished paid-social campaign every week." },
  { status: "○ next", live: false, n: "Phase 2", t: "Email & SMS", d: "Follow-up messaging built from the same demand signal that shaped the ad." },
  { status: "○ planned", live: false, n: "Phase 3", t: "Reviews & reputation", d: "Requests timed to real customer moments, not a generic monthly blast." },
  { status: "○ future", live: false, n: "Phase 4", t: "The full outreach suite", d: "One system running every channel a small business uses to reach customers." },
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
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#signals">Signal</a>
          <a href="#vision">Vision</a>
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

      <Ticker />

      <header className="hero" id="top">
        <div className="hero__texture" />
        <div className="wrap hero__inner">
          <div className="eyebrow">For local businesses</div>
          <h1>
            Know what to advertise <em>this week.</em>
          </h1>
          <p className="hero__sub">
            Every Monday, TRND reads what people near you are searching for and hands you one
            finished ad: the words, the photo to take, who to show it to, what to spend. Built
            for small businesses.
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
            <span className="pill">No agency retainer</span>
            <span className="pill">New campaign every week</span>
            <span className="pill">One plan, $149 a month</span>
          </div>
          <ProductFrame />
        </div>
      </header>

      <hr className="rule" />

      <section className="block" id="product">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Who this is for</span>
            <h2>Built for the businesses that live and die by attention.</h2>
            <p>
              If your customers decide fast and your budget is small, you can&apos;t afford to wait
              a quarter to find out what&apos;s working.
            </p>
          </div>
          <div className="chipband reveal">
            <span>Restaurants &amp; cafés</span>
            <span>Home services</span>
            <span>Health &amp; beauty</span>
            <span>Fitness studios</span>
            <span>Retail &amp; boutiques</span>
            <span>Auto services</span>
            <span>Dental &amp; wellness</span>
          </div>

          <div className="h-[56px]" />

          <div className="split reveal">
            <div className="split__col">
              <div className="split__title">The old way</div>
              {OLD_WAY.map((t) => (
                <div className="split__row" key={t}>
                  <IcoX />
                  {t}
                </div>
              ))}
            </div>
            <div className="split__col now">
              <div className="split__title">The TRND way</div>
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

      <section className="block" id="how">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Product</span>
            <h2>Five steps, running every day.</h2>
            <p>You don&apos;t do any of this manually. Click a step to see it worked through a real example.</p>
          </div>
          <Steps />
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="signals">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Examples</span>
            <h2>What a signal looks like.</h2>
            <p>Illustrative examples of what TRND watches, across different kinds of small businesses.</p>
          </div>
          <div className="signals reveal">
            {SIG_CARDS.map((c) => (
              <div className="sig-card" key={c.name}>
                <svg width="90" height="34" viewBox="0 0 90 34" aria-hidden="true">
                  <path d={c.path} fill="none" stroke="#1EA7AE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="sig-card__stat">{c.stat}</div>
                <div className="sig-card__name">{c.name}</div>
                <div className="sig-card__cat">{c.cat}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="flywheel">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Compounding</span>
            <h2>The more TRND knows about your business, the sharper it gets.</h2>
            <p>
              Detecting a trend is table stakes. What compounds is knowing what you sell, who walks
              in, and which offer, angle, and audience actually converted for you — a picture that
              deepens every week you run.
            </p>
          </div>
          <div className="fly reveal">
            {/* Nodes are the site's pill idiom, anchored on the ring — not
                clip-art circles. */}
            <svg viewBox="-24 16 368 288" fill="none" aria-hidden="true">
              <circle cx="160" cy="160" r="118" stroke="#E3D4AE" strokeWidth="1.5" strokeDasharray="2 7" />
              <circle id="flySpin" cx="160" cy="160" r="118" stroke="#D99A12" strokeWidth="2.5" strokeDasharray="32 710" strokeLinecap="round" />
              <g>
                <rect x="103" y="30" width="114" height="24" rx="12" fill="#FFFFFF" stroke="#EFE0C0" strokeWidth="1" />
                <text x="160" y="46" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#33200F">YOUR BUSINESS</text>
              </g>
              <g>
                <rect x="222" y="148" width="112" height="24" rx="12" fill="#FFFFFF" stroke="#EFE0C0" strokeWidth="1" />
                <text x="278" y="164" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#33200F">REAL CAMPAIGNS</text>
              </g>
              <g>
                <rect x="99" y="266" width="122" height="24" rx="12" fill="#FFFFFF" stroke="#EFE0C0" strokeWidth="1" />
                <text x="160" y="282" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#33200F">PERFORMANCE DATA</text>
              </g>
              <g className="fw-accent">
                <rect x="-9" y="148" width="102" height="24" rx="12" fill="#1EA7AE" stroke="#1EA7AE" strokeWidth="1" />
                <text x="42" y="164" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#EAFBFC">SHARPER RECS</text>
              </g>
            </svg>
            <div className="fly__list">
              {FLY_ITEMS.map((f) => (
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
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="vision">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Where this is going</span>
            <h2>Today: the campaign. Eventually: the whole outreach engine.</h2>
            <p>
              We&apos;re starting narrow on purpose — ad campaigns are where the signal is clearest
              and the payoff is fastest. The same engine extends naturally to the rest of how a
              small business reaches customers.
            </p>
          </div>
          <div className="roadmap reveal">
            {ROADMAP.map((r) => (
              <div className={`rm-card${r.live ? " live" : ""}`} key={r.n}>
                <span className="rm-status">{r.status}</span>
                <span className="rm-n">{r.n}</span>
                <div className="rm-t">{r.t}</div>
                <div className="rm-d">{r.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="rule" />

      <section className="block" id="pricing">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Pricing</span>
            <h2>One plan.</h2>
            <p>
              An ad a week, written before you open the app, the reasoning behind it, and your
              competitors watched daily. Month to month, cancel anytime. The campaigns you
              generated are yours. Pay yearly and get two months free.
            </p>
          </div>

          <div className="tiers reveal">
            <div className="tier tier--featured">
              <span className="tier__badge">TRND</span>
              <h3 className="tier__name">TRND</h3>
              <div className="tier__price">
                $149<small>/ MO</small>
              </div>
              <p className="tier__promise">
                Every Monday: one ad ready to run, and why. Or $1,490 a year.
              </p>
              <div className="tier__list">
                {BASELINE_FEATURES.map((f) => (
                  <div key={f}><IcoCheck />{f}</div>
                ))}
              </div>
              <Link href="/signup" className="btn btn-primary justify-center">
                Start free
              </Link>
              <span className="tier__foot">14-day trial. No card required.</span>
            </div>

          </div>

          <p className="founding-note reveal">
            Founding businesses lock their price for life. Want it done with you?{" "}
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
              <h2>See what TRND would recommend for your business this week.</h2>
              <p>
                Drop your website and we&apos;ll come to the call with a live example already
                built — from what you actually sell, where you sell it. Not a deck about
                businesses like yours; a recommendation for yours.
              </p>
              <div className="demo__bullets">
                <div>
                  <IcoCheck />
                  20-minute call, no slide deck
                </div>
                <div>
                  <IcoCheck />A real sample campaign for your business
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
              <p className="tagline">AI marketing intelligence for small business. usetrnd.com</p>
            </div>
            <div className="foot-links">
              <div className="foot-col">
                <h3>Product</h3>
                <a href="#product">Overview</a>
                <a href="#how">How it works</a>
                <a href="#signals">The signal</a>
              </div>
              <div className="foot-col">
                <h3>Company</h3>
                <a href="#vision">Vision</a>
                <a href="#pricing">Pricing</a>
                <a href="#demo">Request a demo</a>
              </div>
              <div className="foot-col">
                <h3>Legal</h3>
                <Link href="/terms">Terms of Service</Link>
                <Link href="/privacy">Privacy Policy</Link>
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
