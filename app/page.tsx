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
  "Get a finished campaign every morning.",
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
  { n: "01", h: "Every client connects their ad account", p: "As part of onboarding — so TRND can see what actually happened, not just what was published." },
  { n: "02", h: "Real outcomes come back", p: "Clicks, bookings, cost per result, revenue — pulled straight from the campaigns that actually ran." },
  { n: "03", h: "The model learns what converts", p: "Not in general — for this category, this price point, this geography." },
  { n: "04", h: "Next week's recommendation is sharper", p: "For every business on TRND, not just the one that ran the test." },
];

const ROADMAP = [
  { status: "● live", live: true, n: "Phase 1", t: "Ad campaigns", d: "Trend detection and finished paid social & search campaigns, daily or weekly." },
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
        <a href="#top" style={{ display: "inline-flex" }} aria-label="TRND — top">
          <Brand href={null} />
        </a>
        <div className="nav__links">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#signals">Proof</a>
          <a href="#vision">Vision</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="nav__right">
          <Link href="/login" style={{ fontFamily: "var(--body)", fontSize: 14, color: "var(--ink-soft)" }}>
            Sign in
          </Link>
          <ThemeToggle />
          <a href="#demo" className="btn btn-primary btn-sm">
            Request a demo
          </a>
        </div>
      </nav>

      <Ticker />

      <header className="hero" id="top">
        <div className="hero__texture" />
        <div className="wrap hero__grid">
          <div>
            <div className="eyebrow">Live signal → finished campaign</div>
            <h1>
              Know what to advertise — <em>before your competitors do.</em>
            </h1>
            <p className="hero__sub">
              TRND reads what&apos;s actually moving in your market right now and turns it into a
              finished ad campaign — headline, creative, targeting — ready to launch today. Built
              for small businesses, not agencies with a quarter to spare.
            </p>
            <div className="hero__ctas">
              <a href="#demo" className="btn btn-primary">
                Request a demo
              </a>
              <Link href="/signup" className="btn btn-ghost">
                Start free — set up in 2 minutes
              </Link>
            </div>
            <div className="hero__proof">
              <span className="pill">No agency retainer</span>
              <span className="pill">New campaign every week</span>
              <span className="pill">Priced to your ad spend</span>
            </div>
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

          <div style={{ height: 56 }} />

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
            <span className="eyebrow">Proof</span>
            <h2>What &quot;signal&quot; actually looks like.</h2>
            <p>A sample of what TRND is watching this week, across a few different kinds of small businesses.</p>
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
            <h2>The more businesses on TRND, the sharper it gets.</h2>
            <p>
              Detecting a trend is table stakes. What compounds is knowing which offer, angle, and
              audience actually converts — and that only comes from real campaigns running in the
              real world.
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
                <text x="160" y="46" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#33200F">MORE BUSINESSES</text>
              </g>
              <g>
                <rect x="222" y="148" width="112" height="24" rx="12" fill="#FFFFFF" stroke="#EFE0C0" strokeWidth="1" />
                <text x="278" y="164" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#33200F">MORE CAMPAIGNS</text>
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
            <h2>No agency retainer. No annual contract.</h2>
            <p>
              Month to month, priced so it makes sense at $30 a day of ad spend. Cancel anytime —
              the campaigns you generated are yours.
            </p>
          </div>

          <div className="tiers reveal">
            <div className="tier">
              <span className="tier__badge">Baseline</span>
              <h3 className="tier__name">TRND</h3>
              <div className="tier__price">
                $49<small>/ MO</small>
              </div>
              <p className="tier__promise">
                The insights to power your next winning ad campaign. That&apos;s the promise.
              </p>
              <div className="tier__list">
                <div><IcoCheck />This week&apos;s recommendation, scored and explained</div>
                <div><IcoCheck />A finished campaign every week — copy, scripts, statics, targeting</div>
                <div><IcoCheck />Your positioning read: strengths, moat, what to avoid</div>
                <div><IcoCheck />Manual results tracking that sharpens next week</div>
              </div>
              <Link href="/signup" className="btn btn-primary" style={{ justifyContent: "center" }}>
                Start free
              </Link>
              <span className="tier__foot">14-day trial · no card required</span>
            </div>

            <div className="tier tier--featured">
              <span className="tier__badge">● Pro — early access</span>
              <h3 className="tier__name">TRND Pro</h3>
              <div className="tier__price">
                $149<small>/ MO</small>
              </div>
              <p className="tier__promise">
                Your ideator and your analyst. Synced with your ads platform, reading performance
                in real time.
              </p>
              <div className="tier__list">
                <div><IcoCheck />Everything in TRND</div>
                <div><IcoCheck />Connected ad account — results flow back automatically</div>
                <div><IcoCheck />Real-time performance tracking against category benchmarks</div>
                <div><IcoCheck />Recommendations tuned by what actually converted for you</div>
              </div>
              <a href="#demo" className="btn btn-primary" style={{ justifyContent: "center" }}>
                Get early access
              </a>
              <span className="tier__foot">rolling out with connected-account sync</span>
            </div>

            <div className="tier">
              <span className="tier__badge">Early stage</span>
              <h3 className="tier__name">Case by case</h3>
              <div className="tier__price" style={{ fontSize: 24, paddingTop: 8 }}>
                Let&apos;s talk
              </div>
              <p className="tier__promise">
                We get deeper into your stack and set the price together — you get tomorrow&apos;s
                features first.
              </p>
              <div className="tier__list">
                <div><IcoCheck />Everything in Pro, hands-on</div>
                <div><IcoCheck />Automated customer outreach &amp; insights</div>
                <div><IcoCheck />Ad content creation, done with you</div>
                <div><IcoCheck />The full marketing-team stack as it ships</div>
              </div>
              <a href="#demo" className="btn btn-ghost" style={{ justifyContent: "center" }}>
                Talk to us
              </a>
              <span className="tier__foot">limited seats while we&apos;re early</span>
            </div>
          </div>

          <p className="founding-note reveal">
            Founding businesses lock their price for life — it never goes up while you&apos;re a customer.
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
                Tell us a bit about your business. We&apos;ll pull a live example ahead of the
                call, using real signal from your category and area.
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
              <div style={{ marginBottom: 12 }}>
                <Brand href={null} size={18} />
              </div>
              <p className="tagline">AI marketing intelligence for small business. usetrnd.com</p>
            </div>
            <div className="foot-links">
              <div className="foot-col">
                <h3>Product</h3>
                <a href="#product">Overview</a>
                <a href="#how">How it works</a>
                <a href="#signals">Proof</a>
              </div>
              <div className="foot-col">
                <h3>Company</h3>
                <a href="#vision">Vision</a>
                <a href="#pricing">Pricing</a>
                <a href="#demo">Request a demo</a>
              </div>
              <div className="foot-col">
                <h3>Follow</h3>
                <a href="#">X / Twitter</a>
                <a href="#">LinkedIn</a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 TRND, Inc.</span>
            <span>Trend data shown throughout is illustrative.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
