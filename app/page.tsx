import Link from "next/link";

import Brand from "@/components/brand";
import CameraWall from "@/components/sample/camera-wall";
import SampleCreative from "@/components/sample/creative";
import { SAMPLE_CAMS, SAMPLE_TICKER } from "@/components/sample/feed";
import SiteNav from "@/components/site-nav";
import UrlStart from "@/components/url-start";
import { PRICE_LABEL } from "@/lib/billing";

const TICKER_TONE = { new: "text-mint", killed: "text-rec", proven: "text-amber" } as const;

const STEPS = [
  { n: "01", title: "Enter your site", body: "TRND reads it, works out what you sell and to whom, and names the rivals fighting you for the same customer." },
  { n: "02", title: "We pull every ad", body: "Every active Meta ad each rival runs, from the public Ad Library: copy, creative, offer, and the day it started." },
  { n: "03", title: "AI reads the market", body: "Each ad is tagged by angle, hook and offer. The ones still running after weeks are what rivals keep paying for." },
  { n: "04", title: "Watched every day", body: "Launches, kills and ads that just proved themselves, with what they mean for you, in your inbox each morning." },
];

const INCLUDED = [
  "Up to 10 rivals, scanned daily",
  "Every live ad, tagged by angle, hook and offer",
  "A report on what's working, with the ads that prove it",
  "Three ads to make next, briefed for a creator",
  "Email the morning a rival moves",
];

function Ticker() {
  const items = [...SAMPLE_TICKER, ...SAMPLE_TICKER];
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track py-3.5">
        {items.map((t, i) => (
          <span key={i} className="flex items-center gap-3 px-6 text-[13.5px] text-ink-2 whitespace-nowrap">
            <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${TICKER_TONE[t.kind]}`}>{t.kind}</span>
            {t.text}
            <span className="text-ink-3 pl-3">/</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ReportPreview() {
  const proof = SAMPLE_CAMS[0];
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line label">
        <span className="flex items-center gap-2">
          <i className="dot" /> Halo Shower · Briefing
        </span>
        <span>Mon 07:02</span>
      </div>
      <div className="p-5 sm:p-7 flex flex-col gap-6">
        <div>
          <span className="label text-mint">Latest changes</span>
          <p className="disp text-[22px] sm:text-[26px] mt-2 leading-[1.15]">
            AquaBliss just launched a 3-for-$79 refill bundle: the exact price of your filter, aimed at your subscription.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["2", "Launched", "text-mint"],
            ["2", "Killed", "text-rec"],
            ["1", "Proven", "text-amber"],
          ].map(([n, l, c]) => (
            <div key={l} className="inset px-3 py-2.5">
              <div className={`num text-[24px] ${c}`}>{n}</div>
              <div className="label !text-[10px]">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          <div className="cam cam-sm w-20 shrink-0 aspect-[4/5] rounded-md">
            <SampleCreative spec={proof.creative} id="report-proof" />
          </div>
          <div>
            <span className="label">Insight 01</span>
            <p className="font-semibold mt-1">Every ad running 60+ days opens on a symptom, not the filter.</p>
            <p className="text-[13.5px] text-ink-2 mt-1 leading-[1.55]">
              Jolie&apos;s 94-day testimonial leads with “I blamed my shampoo for 3 years.” Their discount ads die inside a month.
            </p>
          </div>
        </div>
        <div className="inset p-4">
          <span className="label">Make next · 01</span>
          <p className="font-semibold mt-1.5">The &ldquo;it was my water&rdquo; testimonial, Halo version</p>
          <dl className="mt-3 grid grid-cols-[64px_1fr] gap-y-1.5 text-[13px]">
            <dt className="label !text-[10px] pt-0.5">Hook</dt>
            <dd className="m-0">&ldquo;I spent $400 on hair masks. The problem was my shower.&rdquo;</dd>
            <dt className="label !text-[10px] pt-0.5">Format</dt>
            <dd className="m-0 text-ink-2">9:16 selfie video, 20–30s</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gridbg [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
        <div className="wrap relative grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-12 lg:gap-16 items-center pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div>
            <span className="eyebrow">
              <i className="dot dot-rec" /> Always-on surveillance for paid social
            </span>
            <h1 className="disp text-[clamp(42px,6.4vw,84px)] leading-[0.98] mt-6">
              Every ad your rivals run.
              <span className="block text-mint">Watched.</span>
            </h1>
            <p className="text-[18px] sm:text-[19px] text-ink-2 leading-[1.6] mt-7 max-w-[540px]">
              TRND reads your competitors&apos; Meta ads every day, tells you which angles, hooks and offers they keep paying for, and
              flags what they just launched and quietly killed.
            </p>
            <div className="mt-9">
              <UrlStart />
              <p className="label mt-4">14-day free trial · no card · first report in minutes</p>
            </div>
          </div>
          <CameraWall />
        </div>
      </section>

      <Ticker />

      <section id="how" className="wrap py-24 sm:py-32">
        <span className="eyebrow">How it works</span>
        <h2 className="disp text-[clamp(30px,4vw,48px)] mt-4 max-w-[760px]">Set it once. Know what they&apos;re running every morning.</h2>
        <ol className="list-none p-0 m-0 mt-14 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4 rounded-xl overflow-hidden border border-line">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-bg-1 p-6 sm:p-7 flex flex-col gap-3">
              <span className="font-mono text-[12px] text-mint">{s.n}</span>
              <h3 className="disp text-[19px]">{s.title}</h3>
              <p className="text-[14.5px] text-ink-2 leading-[1.6]">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="report" className="border-y border-line bg-bg-1/40">
        <div className="wrap py-24 sm:py-32 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-14 items-center">
          <div>
            <span className="eyebrow">The report</span>
            <h2 className="disp text-[clamp(30px,4vw,48px)] mt-4">Insight you can&apos;t get from scrolling the Ad Library.</h2>
            <p className="text-[17px] text-ink-2 leading-[1.65] mt-6">
              Meta shows no spend or results for commercial ads. But an ad still running after 60 days is one a rival keeps paying
              for, and five variants of the same idea is a bet they&apos;re scaling. TRND reads those signals across every rival at once.
            </p>
            <ul className="list-none p-0 mt-8 flex flex-col gap-4">
              {[
                ["What's working", "The angles, hooks and offers the long-running ads share."],
                ["What changed", "Launches, kills and new winners since yesterday."],
                ["What to make", "Three ads modeled on what works, in your voice, briefed for a creator."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-4">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-mint shrink-0" />
                  <span>
                    <b className="font-semibold">{t}.</b> <span className="text-ink-2">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ReportPreview />
        </div>
      </section>

      <section id="pricing" className="wrap py-24 sm:py-32">
        <div className="panel overflow-hidden grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="p-8 sm:p-12">
            <span className="eyebrow">Pricing</span>
            <h2 className="disp text-[clamp(30px,4vw,44px)] mt-4">One plan. Every rival, every day.</h2>
            <p className="text-ink-2 mt-4 text-[16px] leading-[1.6] max-w-[440px]">
              Less than a day of an agency&apos;s time, for a competitor read that never stops. Try it free for 14 days.
            </p>
            <div className="mt-8 flex items-baseline gap-2">
              <span className="num text-[56px] leading-none">{PRICE_LABEL.replace("/mo", "")}</span>
              <span className="label">/ month</span>
            </div>
            <Link href="/signup" className="btn btn-primary btn-lg mt-8">
              Start free trial →
            </Link>
          </div>
          <ul className="list-none m-0 p-8 sm:p-12 flex flex-col gap-4 bg-bg-2 border-t md:border-t-0 md:border-l border-line">
            {INCLUDED.map((f) => (
              <li key={f} className="flex gap-3 text-[15px]">
                <span className="text-mint font-mono">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line relative overflow-hidden">
        <div className="absolute inset-0 gridbg [mask-image:radial-gradient(ellipse_at_bottom,black,transparent_70%)]" aria-hidden />
        <div className="wrap relative py-24 sm:py-28 flex flex-col items-center text-center">
          <h2 className="disp text-[clamp(30px,4.5vw,56px)] max-w-[760px]">See what your rivals are running. Today.</h2>
          <div className="mt-9 w-full flex justify-center">
            <UrlStart cta="Start watching" />
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="wrap py-8 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center text-[13px] text-ink-3">
          <Brand size={13} />
          <span className="flex gap-6">
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <a href="mailto:hello@usetrnd.com" className="hover:text-ink">
              hello@usetrnd.com
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
