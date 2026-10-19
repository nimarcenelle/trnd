import Link from "next/link";

import IdeaCard from "@/components/app/idea-card";
import Brand from "@/components/brand";
import { SAMPLE_HANDLE, SAMPLE_IDEA, SAMPLE_NORMAL, SAMPLE_SOURCE } from "@/components/sample/creator";
import SiteNav from "@/components/site-nav";
import { PRICE_LABEL } from "@/lib/billing";

const LOOP = [
  { k: "Your videos", body: "Which ones broke out against your own usual, and what they share" },
  { k: "Trending", body: "Hashtags and sounds rising in your niche, this week against last" },
  { k: "Creators like you", body: "What's beating their normal, and what you can borrow" },
  { k: "Post this", body: "Then we check how it did, and the next plan gets sharper" },
];

const STEPS = [
  { title: "Enter your handle", body: "We read your last 30 public videos: views, likes, comments, shares and saves, and what your best ones have in common." },
  { title: "We read your niche", body: "We find creators your size posting in your hashtags, and track which hashtags and sounds are early, rising, peaking or fading." },
  { title: "You get three videos to make", body: "Each with the hook, a script second by second, length, sound, when to post, the caption and hashtags, and the video it builds on." },
  { title: "We check if it worked", body: "Add an idea to your week and post it. We find it by its words, and 48 hours later compare its views with your usual." },
];

const SEE = [
  ["Views, likes, comments, shares, saves", "Every public video: yours, creators like you, your niche"],
  ["Your follower count, every day", "Growth from the day you join (TikTok shows no history)"],
  ["Hashtags and sounds in your niche", "This week against last, from the videos we read"],
];
const CANT = [
  ["Watch-through and where people swipe", "Private to your account: coming with Connect TikTok for business accounts"],
  ["Followers gained per video", "Same: TikTok only shows this inside your analytics"],
  ["Anyone's private numbers", "We never guess them, and never claim them"],
];

const FAQ = [
  {
    q: "Do I have to log in with TikTok?",
    a: "No. Enter your handle and we read your public profile, which is enough for everything on this page. Connecting TikTok is optional and makes your own numbers come straight from TikTok.",
  },
  {
    q: "Where do the numbers come from?",
    a: "Public TikTok profiles and hashtag pages: the same views, likes, comments, shares and saves anyone can see. We read them every day and keep the history, so you can see change over time.",
  },
  {
    q: "Is it going to tell me to copy people?",
    a: "No. A borrowed format comes with how to make it yours, in your style. And most ideas build on your own videos that already beat your usual.",
  },
  {
    q: "Which platforms?",
    a: "TikTok first. Instagram Reels is next.",
  },
];

export default function Home() {
  return (
    <div>
      <SiteNav />

      <section className="wrap pt-[clamp(40px,9vw,100px)] pb-12 grid gap-6 max-w-[1080px]">
        <span className="kicker">TikTok growth, explained</span>
        <h1 className="display text-[clamp(34px,6vw,58px)] max-w-[820px]">Know exactly what to post next.</h1>
        <p className="text-ink-2 text-[17px] max-w-[58ch]">
          Enter your TikTok handle. TRND reads your videos, what&apos;s rising in your niche and what&apos;s working for creators like you, then gives you the hook, script, sound and hashtags for your
          next three videos.
        </p>
        <form action="/signup" className="handlebox max-w-[620px]">
          <span className="at">@</span>
          <input name="handle" placeholder="yourhandle" aria-label="Your TikTok handle" autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <button className="btn btn-primary" type="submit">
            Analyze
          </button>
        </form>
        <p className="caption -mt-2 ml-5">Free for 14 days. Public accounts only. No TikTok login needed.</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] border border-line rounded-[14px] bg-surface overflow-hidden mt-2">
          {LOOP.map((l) => (
            <div key={l.k} className="p-3.5 border-r border-line last:border-r-0 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:last:border-b-0">
              <b className="mono text-[11px] text-brand block mb-1 uppercase tracking-[0.08em]">{l.k}</b>
              <p className="text-[14px] text-ink-2">{l.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap pb-16 grid gap-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="label">What a plan looks like · @{SAMPLE_HANDLE}, an example creator</span>
        </div>
        <div className="night grid gap-2.5 p-[22px]">
          <span className="label">This week&apos;s answer</span>
          <h2 className="heading text-[clamp(18px,2.6vw,23px)]">
            People come to you for <em>one tool, one result</em> and for <em>series</em>. Turn your tool videos into a ranked test this week, and keep sponsors after the payoff.
          </h2>
        </div>
        <IdeaCard idea={SAMPLE_IDEA} rank={1} planId="sample" source={SAMPLE_SOURCE} normal={SAMPLE_NORMAL} run={null} open sample />
      </section>

      <section id="how" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-8">
          <div>
            <span className="kicker">How it works</span>
            <h2 className="display text-[clamp(26px,4vw,38px)] mt-3 max-w-[680px]">From your last 30 videos to your next three.</h2>
          </div>
          <ol className="list-none m-0 p-0 grid gap-3 grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-5 grid gap-2 content-start">
                <span className="display text-[26px] text-brand leading-none">{i + 1}</span>
                <h3 className="text-[17px] font-bold mt-1">{s.title}</h3>
                <p className="text-ink-2 text-[14.5px]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="data" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-8">
          <div>
            <span className="kicker">What we read</span>
            <h2 className="display text-[clamp(26px,4vw,38px)] mt-3 max-w-[720px]">Real numbers only. We say what we can&apos;t see.</h2>
          </div>
          <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
            {[
              { title: "What we can see", rows: SEE, cls: "chip chip-own" },
              { title: "What we can't (yet)", rows: CANT, cls: "chip chip-miss" },
            ].map((col) => (
              <div key={col.title} className="card p-5 grid gap-3 content-start">
                <span className={`${col.cls} self-start`}>{col.title}</span>
                {col.rows.map(([k, v]) => (
                  <div key={k}>
                    <div className="font-bold">{k}</div>
                    <div className="text-ink-2 text-[14px]">{v}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-6 justify-items-start">
          <span className="kicker">Pricing</span>
          <div className="card p-6 sm:p-8 grid gap-4 max-w-[480px] w-full">
            <div className="flex items-baseline gap-2">
              <span className="display text-[40px]">{PRICE_LABEL.split("/")[0]}</span>
              <span className="text-ink-2">/ month</span>
            </div>
            <ul className="m-0 pl-[18px] grid gap-1.5 text-[15px]">
              <li>A new plan every week, three scripted videos</li>
              <li>Your videos, read every day</li>
              <li>Up to 8 creators like you, and your niche&apos;s trends</li>
              <li>Every idea checked 48 hours after you post it</li>
            </ul>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Start your 14-day free trial
            </Link>
            <span className="caption">No card to start. Cancel anytime.</span>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-6 max-w-[820px]">
          <span className="kicker">Questions</span>
          <div className="card divide-y divide-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex justify-between gap-4 px-5 py-4 font-bold">
                  {f.q}
                  <span className="text-ink-3 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="px-5 pb-5 text-ink-2 leading-[1.65]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-16 sm:py-24 grid gap-6 justify-items-center text-center">
          <h2 className="display text-[clamp(26px,4vw,40px)] max-w-[640px]">Stop guessing what to post.</h2>
          <form action="/signup" className="handlebox w-full max-w-[520px]">
            <span className="at">@</span>
            <input name="handle" placeholder="yourhandle" aria-label="Your TikTok handle" autoComplete="off" autoCapitalize="none" spellCheck={false} />
            <button className="btn btn-primary" type="submit">
              Start free
            </button>
          </form>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="wrap py-8 flex flex-col sm:flex-row gap-4 justify-between sm:items-center text-[13px] text-ink-3">
          <div className="flex items-center gap-4">
            <Brand size={14} />
            <span>© {new Date().getFullYear()} TRND</span>
          </div>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <a href="mailto:hello@usetrnd.com" className="hover:text-ink">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
