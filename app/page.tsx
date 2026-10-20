import Link from "next/link";

import IdeaCard from "@/components/app/idea-card";
import Brand from "@/components/brand";
import StartForm from "@/components/preview/start-form";
import { SAMPLE_HANDLE, SAMPLE_IDEA, SAMPLE_NORMAL, SAMPLE_SOURCE } from "@/components/sample/creator";
import SiteNav from "@/components/site-nav";
import { PRICES, TRIAL_DAYS } from "@/lib/billing";

const STEPS = [
  { title: "Enter your handle", body: "No login, no password. We read your public videos: views, likes, comments, shares and saves." },
  { title: "We read your niche", body: "Creators your size posting in your hashtags, what's beating their usual, and which sounds and hashtags are rising." },
  { title: "Get three videos to make", body: "The hook, a script second by second, length, sound, when to post, the caption and hashtags, and the proof behind each." },
];

const GET = [
  { title: "Scripts, not stats", body: "Every week, three videos written for your niche, your style and your goal, ready to film." },
  { title: "Proof for every idea", body: "Each idea shows the video it builds on and how far it beat its creator's usual views." },
  { title: "Trends while they're early", body: "Hashtags and sounds counted this week against last in your niche, so you join before it's crowded." },
  { title: "Did it work?", body: "Post an idea and we find it, then check its views 48 hours later against your typical video." },
];

const FAQ = [
  {
    q: "Do I have to log in with TikTok?",
    a: "No. Enter your handle and we read your public profile. Nothing is posted, and we never see your password or your private analytics.",
  },
  {
    q: "What does the free preview include?",
    a: "Your typical views and best recent video, creators a step ahead of you, what's rising in your niche, and one fully scripted idea. The trial unlocks all three each week.",
  },
  {
    q: "What happens after the trial?",
    a: `Your plan continues at ${PRICES.monthly.label} (or ${PRICES.weekly.label} if you pick weekly). We email you two days before the trial ends, and you can cancel in two clicks before then.`,
  },
  {
    q: "Where do the numbers come from?",
    a: "Public TikTok profiles and hashtag pages: the views, likes, comments, shares and saves anyone can see. We never guess numbers TikTok keeps private, like watch time.",
  },
  {
    q: "Is it going to tell me to copy people?",
    a: "No. Most ideas build on your own videos that beat your usual. A borrowed format always comes with how to make it yours.",
  },
];

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 text-pos" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The hero's product shot: the first lines of a plan, as it looks on a phone. */
function PhoneShot() {
  return (
    <div className="relative mx-auto w-[300px] max-w-full">
      <div className="rounded-[40px] border border-line bg-surface p-3 shadow-[var(--shadow-lg)]">
        <div className="rounded-[30px] bg-bg overflow-hidden border border-line">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <Brand href={null} size={14} sub={false} />
            <span className="caption">@{SAMPLE_HANDLE}</span>
          </div>
          <div className="mx-3 night p-3.5 !rounded-[16px]">
            <div className="label">Your answer this week</div>
            <p className="heading text-[14.5px] mt-1.5">
              People come for <em>one tool, one result</em>. Turn it into a ranked test.
            </p>
          </div>
          <div className="m-3 card p-3.5 grid gap-2">
            <div className="flex gap-1.5">
              <span className="pill pill-brand !text-[10.5px]">Borrow a format</span>
              <span className="pill !text-[10.5px]">11× their usual</span>
            </div>
            <p className="heading text-[14px] leading-snug">&ldquo;I tested 7 AI study tools for a week. Only 2 are worth it.&rdquo;</p>
            {[
              ["0–2s", "Seven paper app icons. Five get flicked off."],
              ["2–25s", "Tools 7 to 3, four seconds each."],
              ["25–40s", "The top two, with a quick demo."],
            ].map(([t, s]) => (
              <div key={t} className="grid grid-cols-[46px_minmax(0,1fr)] gap-2 text-[12px]">
                <span className="mono text-brand">{t}</span>
                <span className="text-ink-2">{s}</span>
              </div>
            ))}
          </div>
          <div className="mx-3 mb-4 grid grid-cols-2 gap-2">
            <div className="card px-3 py-2">
              <div className="label !text-[11px]">Typical video</div>
              <div className="display !font-semibold text-[15px]">48K</div>
            </div>
            <div className="card px-3 py-2">
              <div className="label !text-[11px]">Rising</div>
              <div className="mono text-[12.5px] text-cyan mt-0.5">#studytok</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div>
      <SiteNav />

      <section id="start" className="wrap pt-[clamp(36px,7vw,84px)] pb-16 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-center scroll-mt-14">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 min-w-0">
          <span className="kicker">For TikTok creators</span>
          <h1 className="display text-[clamp(34px,5.6vw,56px)]">Your next three TikToks, scripted from what&apos;s working in your niche.</h1>
          <p className="text-ink-2 text-[17.5px] max-w-[54ch] leading-[1.55]">
            Enter your handle. In about a minute you get your numbers, creators a step ahead of you, what&apos;s rising in your niche, and a video to make, scripted second by second.
          </p>
          <div className="max-w-[580px]">
            <StartForm cta="Get my free plan" compact />
          </div>
          <ul className="list-none m-0 p-0 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-2">
            {["Free preview, no card", "No TikTok login", "Public videos only"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check /> {t}
              </li>
            ))}
          </ul>
        </div>
        <PhoneShot />
      </section>

      <section id="how" className="border-t border-line bg-surface scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-10">
          <div className="max-w-[640px]">
            <span className="kicker">How it works</span>
            <h2 className="display text-[clamp(26px,3.8vw,36px)] mt-3">From your last 30 videos to your next three.</h2>
          </div>
          <ol className="list-none m-0 p-0 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid gap-2 content-start">
                <span className="w-9 h-9 rounded-full bg-brand-soft text-brand grid place-items-center font-bold">{i + 1}</span>
                <h3 className="text-[18px] font-bold mt-2">{s.title}</h3>
                <p className="text-ink-2 text-[15px] leading-[1.6]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-16 sm:py-20 grid gap-8">
          <div className="max-w-[640px]">
            <span className="kicker">What a plan looks like</span>
            <h2 className="display text-[clamp(26px,3.8vw,36px)] mt-3">Every idea, ready to film.</h2>
            <p className="text-ink-2 mt-3">An example plan for @{SAMPLE_HANDLE}, an invented study creator.</p>
          </div>
          <IdeaCard idea={SAMPLE_IDEA} rank={1} planId="sample" source={SAMPLE_SOURCE} normal={SAMPLE_NORMAL} run={null} open sample />
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="wrap py-16 sm:py-20 grid gap-10">
          <div className="max-w-[640px]">
            <span className="kicker">What you get</span>
            <h2 className="display text-[clamp(26px,3.8vw,36px)] mt-3">Less guessing, more posting.</h2>
          </div>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {GET.map((g) => (
              <div key={g.title} className="grid gap-1.5 content-start">
                <h3 className="text-[18px] font-bold">{g.title}</h3>
                <p className="text-ink-2 text-[15px] leading-[1.6]">{g.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid grid-cols-[minmax(0,1fr)] gap-8">
          <div className="max-w-[640px]">
            <span className="kicker">Pricing</span>
            <h2 className="display text-[clamp(26px,3.8vw,36px)] mt-3">Free for {TRIAL_DAYS} days. Then one simple plan.</h2>
            <p className="text-ink-2 mt-3">Start with a free preview, no card. The trial unlocks everything; we remind you two days before it ends.</p>
          </div>
          <div className="grid gap-3.5 grid-cols-[minmax(0,1fr)] sm:grid-cols-2 max-w-[760px]">
            {(["monthly", "weekly"] as const).map((i) => (
              <div key={i} className={`card p-6 grid gap-3 content-start ${i === "monthly" ? "!border-brand shadow-[inset_0_0_0_1px_var(--brand)]" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{i === "monthly" ? "Monthly" : "Weekly"}</span>
                  {i === "monthly" && <span className="pill pill-brand">Best value</span>}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="display text-[38px]">{PRICES[i].amount}</span>
                  <span className="text-ink-2">/ {PRICES[i].per}</span>
                </div>
                <span className="text-[14px] text-ink-2">{i === "monthly" ? `About ${PRICES.monthly.perWeek} a week, 42% less than weekly` : "Pay a week at a time"}</span>
              </div>
            ))}
          </div>
          <ul className="list-none m-0 p-0 grid gap-2 text-[15px] max-w-[760px] sm:grid-cols-2">
            {["Three scripted videos every week", "Your videos read every day", "Creators ahead of you and your niche's trends", "Every idea checked 48 hours after you post"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <Check /> {t}
              </li>
            ))}
          </ul>
          <Link href="/#start" className="btn btn-primary btn-lg justify-self-start">
            Get my free plan
          </Link>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-surface scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-6">
          <span className="kicker">Questions</span>
          <div className="divide-y divide-line border-y border-line max-w-[820px]">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex justify-between gap-4 py-4 font-bold text-[16px]">
                  {f.q}
                  <span className="text-ink-3 transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
                </summary>
                <p className="pb-5 text-ink-2 leading-[1.65]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-16 sm:py-24 grid gap-6 justify-items-center text-center">
          <h2 className="display text-[clamp(26px,4vw,40px)] max-w-[640px]">See what to post next. Free, in about a minute.</h2>
          <div className="w-full max-w-[540px] text-left">
            <StartForm cta="Get my free plan" compact />
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="wrap py-10 grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] items-start text-[14px] text-ink-2">
          <div className="grid gap-2">
            <Brand size={16} />
            <p className="text-ink-3 max-w-[40ch]">Weekly video plans for TikTok creators, from public data only.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/#how" className="hover:text-ink">
              How it works
            </Link>
            <Link href="/#pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <a href="mailto:hello@usetrnd.com" className="hover:text-ink">
              Contact
            </a>
          </nav>
        </div>
        <div className="wrap pb-8 caption">© {new Date().getFullYear()} TRND. Not affiliated with TikTok.</div>
      </footer>
    </div>
  );
}
