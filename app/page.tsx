import Link from "next/link";

import IdeaCard, { IDEA_TYPE } from "@/components/app/idea-card";
import Brand from "@/components/brand";
import StartForm from "@/components/preview/start-form";
import Avatar from "@/components/app/avatar";
import NextTikTok from "@/components/app/next-tiktok";
import { Emphasis } from "@/components/app/views";
import { SAMPLE, SAMPLE_BEST, SAMPLE_IDEA, SAMPLE_NORMAL, SAMPLE_SOURCE } from "@/components/sample/humm";
import SiteNav from "@/components/site-nav";
import { PRICES, TRIAL_DAYS } from "@/lib/billing";
import { aheadLine } from "@/lib/creators/stats";
import { compact, times } from "@/lib/format";
import { nextTikTok } from "@/lib/preview/next-tiktok";

const FAQ = [
  {
    q: "Do I have to log in with TikTok?",
    a: "No. Enter your handle and we read your public profile. Nothing is posted, and we never see your password or your private analytics.",
  },
  {
    q: "What does the free preview include?",
    a: "Your typical views and best recent video, creators a step ahead of you in your niche, what's rising, and one fully scripted idea. The trial gives you all three, every week.",
  },
  {
    q: "Who are the creators ahead of me?",
    a: "Accounts in your niche with 2 to 50 times your followers: the ones you could grow into next, not the biggest names on the app. We match them from your hashtags, and after you sign up you can add up to three creators you want to be like.",
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
    a: "No. Each idea builds on a video that already worked: one of yours that beat your usual, or one that helped a creator ahead of you get there. A borrowed format always comes with how to make it yours.",
  },
];

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 text-pos" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The hero's product shot: the real free preview of @humm.app, as it looks on a phone. */
function PhoneShot() {
  return (
    <div className="relative mx-auto w-[300px] max-w-full">
      {/* A soft pink and cyan glow behind the phone, and a slight tilt, so the product shot reads as the hero. */}
      <div aria-hidden className="absolute -inset-16 -z-10 rounded-full blur-3xl opacity-70 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand)_28%,transparent),transparent),radial-gradient(closest-side_at_80%_80%,color-mix(in_srgb,var(--cyan)_24%,transparent),transparent)]" />
      <div className="rounded-[40px] border border-line bg-surface p-3 shadow-[var(--shadow-lg),var(--shadow-pink)] lg:rotate-[2deg] transition-transform duration-500 hover:rotate-0">
        <div className="rounded-[30px] bg-bg overflow-hidden border border-line">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <Brand href={null} size={14} sub={false} />
            <span className="caption">@{SAMPLE.handle}</span>
          </div>
          <div className="mx-3 night p-3.5 !rounded-[16px]">
            <div className="label">Your answer this week</div>
            <p className="heading text-[13.5px] leading-snug mt-1.5 line-clamp-4">
              <Emphasis text={SAMPLE.plan.headline} />
            </p>
          </div>
          <div className="mx-3 mt-2.5 grid grid-cols-2 gap-2">
            <div className="card px-3 py-2">
              <div className="label !text-[11px]">Your typical video</div>
              <div className="display text-[18px]">{compact(SAMPLE_NORMAL.views)}</div>
            </div>
            <div className="card px-3 py-2">
              <div className="label !text-[11px]">Your best recent</div>
              <div className="display text-[18px] stat-up">{SAMPLE_BEST ? times(SAMPLE_BEST) : "—"}</div>
            </div>
          </div>
          <div className="m-3 mt-2.5">
            <NextTikTok data={nextTikTok(SAMPLE.handle, SAMPLE_IDEA)} tint={IDEA_TYPE[SAMPLE_IDEA.type].tint} cover={SAMPLE_SOURCE.video?.cover_url ?? null} />
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

      <section id="start" className="wrap pt-[clamp(36px,7vw,84px)] pb-16 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-center scroll-mt-14 isolate">
        <div className="rise grid grid-cols-[minmax(0,1fr)] gap-6 min-w-0">
          <span className="kicker">For TikTok creators</span>
          <h1 className="display text-[clamp(34px,5.6vw,56px)]">
            Your next three TikToks, scripted. <span className="stat-up">Free in seconds.</span>
          </h1>
          <p className="text-ink-2 text-[17.5px] max-w-[54ch] leading-[1.55]">
            Type your handle. We find the creators a step ahead of you in your niche, what got them there, and turn it into three videos you can film this week.
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

      <section className="border-t border-line">
        <div className="wrap py-16 sm:py-20 grid gap-8">
          <div className="max-w-[640px]">
            <span className="kicker">What a plan looks like</span>
            <h2 className="display text-[clamp(26px,3.8vw,36px)] mt-3">Every idea, ready to film.</h2>
            <p className="text-ink-2 mt-3">A real plan for @humm.app, a 1,299-follower account with 4 videos.</p>
          </div>
          <div className="card p-4 grid gap-3 content-start max-w-[560px]">
            <div className="font-bold">Creators ahead of @{SAMPLE.handle}</div>
            {SAMPLE.peers.slice(0, 4).map((x) => (
              <div key={x.handle} className="flex items-center gap-2.5 min-w-0">
                <Avatar name={x.handle} size={30} ring />
                <div className="min-w-0 grid gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-[14px]">@{x.handle}</span>
                    {aheadLine(x.followers, SAMPLE.author?.followers ?? null) && <span className="pill pill-brand !text-[11.5px]">{aheadLine(x.followers, SAMPLE.author?.followers ?? null)}</span>}
                  </div>
                  <div className="caption line-clamp-2">
                    {compact(x.followers)} followers{x.best?.hook ? <> · best recent: &ldquo;{x.best.hook}&rdquo;, {compact(x.best.views)} views</> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <IdeaCard idea={SAMPLE_IDEA} rank={1} planId="sample" source={SAMPLE_SOURCE} normal={SAMPLE_NORMAL} run={null} open sample />
        </div>
      </section>

      <section id="pricing" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid grid-cols-[minmax(0,1fr)] gap-8">
          <div className="max-w-[640px]">
            <span className="kicker">Pricing</span>
            <h2 className="display text-[clamp(26px,3.8vw,36px)] mt-3">Free for {TRIAL_DAYS} days. Then one simple plan.</h2>
            <p className="text-ink-2 mt-3">Start with a free preview, no card. The trial gives you everything; we remind you two days before it ends.</p>
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
          <h2 className="display text-[clamp(26px,4vw,40px)] max-w-[640px]">See what to post next. Free, in seconds.</h2>
          <div className="w-full max-w-[540px] text-left">
            <StartForm cta="Run it on my handle" compact />
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
