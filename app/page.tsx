import Link from "next/link";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { PRICE_LABEL } from "@/lib/billing";

const STEPS = [
  {
    n: "01",
    title: "Enter your site",
    body: "TRND reads it, works out what you sell and who you sell to, and names the competitors fighting you for the same customer.",
  },
  {
    n: "02",
    title: "See every ad they run",
    body: "Every active Meta ad from every rival, pulled from the Ad Library: the copy, the creative, the offer, and how long each ad has been running.",
  },
  {
    n: "03",
    title: "Know what's working",
    body: "An ad still running after 60 days is one they keep paying for. TRND finds the angles, hooks and offers the long-runners share and turns them into ads you can make.",
  },
  {
    n: "04",
    title: "Get told when they move",
    body: "Every day TRND checks again. New launches, killed ads and ads that just proved themselves land in your inbox with what they mean for you.",
  },
];

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col">
      <nav className="rd-nav">
        <Brand live />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
        </div>
      </nav>

      <section className="wrap pt-20 pb-16 sm:pt-28">
        <span className="eyebrow">Always-on surveillance for paid social</span>
        <h1 className="h-disp text-[clamp(36px,6vw,64px)] mt-4 mb-5 max-w-[820px]">
          See every ad your competitors run. Copy what&apos;s working.
        </h1>
        <p className="text-ink-soft text-[18px] leading-[1.6] max-w-[620px] m-0">
          TRND watches your rivals&apos; Meta ads every day and tells you which angles, hooks and offers they keep paying for, what
          they just launched, and what they quietly killed.
        </p>
        <form action="/signup" method="get" className="mt-9 flex flex-col sm:flex-row gap-3 max-w-[560px]">
          <input className="input flex-1" name="site" placeholder="yourbrand.com" aria-label="Your website" required />
          <button className="btn btn-primary justify-center" type="submit">
            Watch my rivals
          </button>
        </form>
        <p className="mono-label mt-3">14-day free trial · no card</p>
      </section>

      <section className="wrap pb-20 grid gap-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="card">
            <span className="mono-label">{s.n}</span>
            <h2 className="h-disp text-[20px] mt-2 mb-2">{s.title}</h2>
            <p className="text-ink-soft m-0 leading-[1.6]">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="wrap pb-24">
        <div className="card-lg p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <span className="eyebrow">One plan</span>
            <h2 className="h-disp text-[28px] mt-2 mb-2">{PRICE_LABEL}</h2>
            <p className="text-ink-soft m-0">Up to 10 rivals watched daily · every ad analyzed · daily change alerts · cancel anytime.</p>
          </div>
          <Link href="/signup" className="btn btn-primary justify-center">
            Start free trial
          </Link>
        </div>
      </section>

      <footer className="mt-auto border-t border-line">
        <div className="wrap py-6 flex justify-between text-[13px] text-ink-faint">
          <span>© TRND</span>
          <span className="flex gap-4">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
