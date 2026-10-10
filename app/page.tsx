import Link from "next/link";

import Brand from "@/components/brand";
import FullLanding from "@/components/landing/full-landing";
import CameraWall from "@/components/read/camera-wall";
import CategoryRead from "@/components/read/category-read";
import { AdCard, GapCard, OpeningMix } from "@/components/read/parts";
import { PLAN_TIERS } from "@/lib/billing";
import { getAdminRepo } from "@/lib/db/admin";
import { isPilotGated } from "@/lib/env";
import { FOCUS_MODE } from "@/lib/focus";
import { EXAMPLE_BRAND, EXAMPLE_RIVALS, exampleAds } from "@/lib/read/example";
import { findGap, summarizeAdvertiser } from "@/lib/read/gap";
import { OPENING_PHRASE } from "@/lib/read/labels";
import { buildMarketPulse, type MarketPulse } from "@/lib/read/market";

import "./landing.css";
import "./read.css";

// The pitch: cheat off your competitors, because the Ad Library is public
// and their long-running ads are what they already paid to learn. It never
// means copying: the brief is written in the brand's own voice.
// The page is one input: a store's address, and a minute later the
// brand's category read back to it (lib/read/run.ts). Under the input sits
// a sample read, so a visitor sees what they get before they type: a real
// category from the week's reads with every brand renamed when there is one
// (lib/read/market.ts), the invented example when there isn't. A strip of
// the week's real numbers runs under the nav, and hides when there are none. Every claim on the page is
// counted from a site and the public Ad Library, and says what it can't
// know. The full pitch page is kept behind FOCUS_MODE.

/** Rebuilt hourly: the pulse sums every brand's reads, and a visit never waits on it. */
export const revalidate = 3600;

const PULSE_BUDGET_MS = 8000;
const PULSE_TOTALS_MIN = 100;

async function loadPulse(): Promise<MarketPulse | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PULSE_BUDGET_MS));
  try {
    return await Promise.race([buildMarketPulse(getAdminRepo()).catch(() => null), timeout]);
  } catch (err) {
    // No admin credentials at build time: the page renders without the pulse.
    console.warn("[landing] market pulse unavailable:", (err as Error).message);
    return null;
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");

function MarketStrip({ pulse }: { pulse: MarketPulse }) {
  // The totals undersell until there are enough of them; the per-category
  // reads stand on their own from the first category.
  const totals =
    pulse.ads >= PULSE_TOTALS_MIN
      ? [`This week: ${fmt(pulse.ads)} live ads from ${fmt(pulse.brands)} brands read`, `${fmt(pulse.stillRunning)} still running past three weeks`]
      : [];
  const items = [
    ...totals,
    ...pulse.categories.slice(0, 8).flatMap((c) => [
      `${c.category}: longest-running ad ${c.longestDays ?? "?"} days`,
      ...(c.topOpening && c.topShare >= 0.3 ? [`${c.category}: ${Math.round(c.topShare * 100)}% of long runners ${OPENING_PHRASE[c.topOpening]}`] : []),
    ]),
  ];
  const row = (hidden: boolean) => (
    <div className="rd-strip__row" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i}>
          <i aria-hidden="true" />
          {t}
        </span>
      ))}
    </div>
  );
  return (
    <div className="rd-strip" role="region" aria-label="This week's reads, summed across every brand">
      <span className="rd-strip__label">Rec</span>
      <div className="rd-strip__track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** The sample's data: a real anonymized category when the pulse has one, the invented example when not. */
function sampleData(pulse: MarketPulse | null) {
  const real = pulse?.sample ?? null;
  if (real) {
    const { own, rivals, gap } = real;
    return {
      real: true,
      own,
      rivals,
      gap,
      category: real.category,
      title: `trnd · competitive read · ${real.category.toLowerCase()}`,
      note: `A real read from ${real.category.toLowerCase()} this week, one brand against ${rivals.length} of its rivals, every name hidden. Yours reads your store and your real rivals.`,
    };
  }
  const ads = exampleAds();
  const own = summarizeAdvertiser(EXAMPLE_BRAND.name, EXAMPLE_BRAND.domain, ads[EXAMPLE_BRAND.name] ?? []);
  const rivals = EXAMPLE_RIVALS.map((r) => summarizeAdvertiser(r.name, r.domain, ads[r.name] ?? []));
  return {
    real: false,
    own,
    rivals,
    gap: findGap(own, rivals),
    category: EXAMPLE_BRAND.category,
    title: `trnd · competitive read · ${EXAMPLE_BRAND.domain}`,
    note: "A sample read of an invented shower-filter brand. Yours reads your store and your real rivals.",
  };
}

function SampleRead({ pulse }: { pulse: MarketPulse | null }) {
  const { real, own, rivals, gap, title, note } = sampleData(pulse);
  const shown = rivals
    .map((r) => ({ name: r.name, ad: r.top.find((a) => a.opening === gap.opening && a.text) ?? r.top[0] }))
    .filter((s) => s.ad)
    .slice(0, 2);
  return (
    <div className="rd-sample" aria-label={real ? "A real read with every brand's name hidden" : "A sample read of an invented brand"}>
      <p className="rd-kicker rd-sample__kicker">What a read looks like</p>
      <div className="rd-window">
        <div className="rd-window__bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>{title}</span>
          <em>{real ? "Live · names hidden" : "Sample"}</em>
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
      <p className="rd-fine rd-sample__note">{note}</p>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    h: "Paste your site",
    p: "We read what you sell and who you sell it to, find your socials and your live ads, and name the ten brands running Meta ads to your customers. Every one checked to exist.",
  },
  {
    n: "02",
    h: "Cameras on, every day",
    p: "Each competitor's ads are read daily and sorted by how long they've survived on a real budget. Losers get switched off. What's left is what they keep paying for.",
  },
  {
    n: "03",
    h: "The gap, the test, the score",
    p: "What they launched and killed, the opening they lean on that you don't, a brief in your voice to fill it, and the score once it's live. Never a copy of theirs.",
  },
];

const FIGURES = [
  { v: "~60s", l: "from URL to your first read" },
  { v: "10", l: "competitors on camera, named for you" },
  { v: "Daily", l: "every ad of theirs, read again" },
  { v: "0", l: "logins or ad accounts to start" },
];

export default async function Home() {
  if (!FOCUS_MODE) return <FullLanding />;
  const pulse = await loadPulse();
  const showStrip = pulse !== null && pulse.categories.length > 0;
  const wall = sampleData(pulse);
  return (
    <div className="rd">
      <div className="rd-atmos" aria-hidden="true" />

      <nav className="rd-nav">
        <Brand href={null} live />
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
      {showStrip ? <MarketStrip pulse={pulse} /> : null}

      <main>
        <header className="rd-hero" id="read">
          <div className="rd-hero__grid">
            <div className="rd-hero__copy">
              <span className="rd-pill">
                <i aria-hidden="true" /> Live · watching Meta ads 24/7
              </span>
              <h1>Always-on surveillance for paid ads.</h1>
              <p className="rd-hero__sub">
                TRND puts cameras on your competitors&rsquo; Facebook and Instagram ads. Every launch, clone, scale-up and shutdown pings you
                the moment it happens, with what it means for your business and what to run next. Paste your store for a free read.
              </p>
              <CategoryRead gated={isPilotGated} />
            </div>
            <CameraWall rivals={wall.rivals} own={wall.own} category={wall.category} />
          </div>
          <SampleRead pulse={pulse} />
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
          <span className="rd-pill">
            <i aria-hidden="true" /> Your market is running ads right now
          </span>
          <h2 className="rd-h2">Switch the cameras on.</h2>
          <a href="#read" className="rd-btn rd-btn--gold rd-btn--lg">
            Switch the cameras on
          </a>
        </section>
      </main>

      <footer className="rd-footer">
        <Brand href={null} size={14} />
        <span>Ad intelligence. Always-on surveillance for paid ads.</span>
        <span className="rd-footer__links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </span>
      </footer>
    </div>
  );
}
