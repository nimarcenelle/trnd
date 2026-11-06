import Link from "next/link";

import Avatar from "@/components/app/avatar";
import GapCard from "@/components/app/gap-card";
import IdeaCard, { IDEA_TYPE } from "@/components/app/idea-card";
import ViewsStrip from "@/components/app/views-strip";
import Brand from "@/components/brand";
import Pricing from "@/components/pricing";
import DiagnosisCard from "@/components/app/diagnosis-card";
import { LENA, LENA_AHEAD, LENA_DIAGNOSIS, LENA_GAP, LENA_IDEA, LENA_KILLER, LENA_NORMAL, LENA_SCORECARD, LENA_SOURCE, LENA_VIEWS, LENA_WEEK, SHOP } from "@/components/sample/lena";
import SiteNav from "@/components/site-nav";
import { aheadLine } from "@/lib/creators/stats";
import { dollarRange } from "@/lib/creators/gap";
import { compact, times } from "@/lib/format";

const STEPS = [
  { title: "Enter your handle", body: "Your public TikTok handle. No login, no password, nothing posted." },
  { title: "See the gap", body: "Your typical video against the creators 2–5× your size in your niche, in views and, where it applies, dollars." },
  { title: "Get three scripts", body: "Hook, script second by second, sound, hashtags and when to post, built from what's working for them." },
  { title: "See what worked, 48 hours later", body: "Post an idea and we check it against your usual. The next plan builds on what landed." },
];

const FAQ = [
  {
    q: "Where does the data come from?",
    a: "Public TikTok profiles and hashtag pages: the views, likes, comments, shares and saves anyone can see. We never guess numbers TikTok keeps private, like watch time or where viewers live.",
  },
  {
    q: "Do I have to log in with TikTok?",
    a: "No. Enter your handle and we read your public profile. Nothing is posted, and we never see your password or private analytics. You can connect TikTok later if you want your own numbers straight from TikTok, but you don't have to.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from Settings in two clicks and you keep your plan until the end of the period you paid for. Your account goes back to Free: one scripted idea a week.",
  },
  {
    q: "Can I get a refund?",
    a: "Yes. If a paid plan isn't for you, email hello@usetrnd.com within 14 days of your first charge for a full refund.",
  },
  {
    q: "What counts as a post?",
    a: "A public TikTok video on your account. When one matches an idea from your plan, by its words, hashtags or sound, we mark the idea posted and check it 48 hours later against your typical views.",
  },
  {
    q: "Where does the dollar figure come from?",
    a: "Creators report Creator Rewards paying roughly $0.40–$1.00 per 1,000 qualified views; TikTok doesn't publish a rate. Only videos over a minute earn, from 10K followers, and not every view qualifies, so we show a range and treat it as the most the gap could be worth. Under 10K followers we show views only.",
  },
];

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The hero's product shot: an invented 41.8K-follower creator's week, in three columns. */
function Mockup() {
  return (
    <div className="card p-3 sm:p-4 shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between gap-3 px-1 pb-3 border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={LENA.handle} size={30} />
          <div className="min-w-0">
            <div className="font-semibold text-[14px] truncate">@{LENA.handle}</div>
            <div className="caption">{compact(LENA.followers)} followers · Creator Rewards</div>
          </div>
        </div>
        <span className="pill pill-brand">This week</span>
      </div>
      <div className="grid gap-3 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="well p-3.5 grid gap-3 content-start">
          <div>
            <div className="label">Your typical video</div>
            <div className="display text-[28px] tnum">{compact(LENA_GAP.mine)}</div>
            <ViewsStrip views={LENA_VIEWS} usual={LENA_NORMAL.views} />
          </div>
          <div>
            <div className="label">Creators 2–5× your size</div>
            <div className="display text-[28px] tnum text-brand">{compact(LENA_GAP.ahead)}</div>
            <div className="caption">average typical views</div>
          </div>
          {LENA_GAP.dollars && (
            <p className="text-[13.5px] leading-[1.45] m-0 border-t border-line pt-3">
              That gap is roughly <b className="tnum">{dollarRange(LENA_GAP.dollars)}</b> at current Creator Rewards rates.
            </p>
          )}
        </div>
        <div className="grid gap-2 content-start">
          <div className="label px-1">Your next 3 posts</div>
          {LENA_WEEK.map((w, i) => (
            <div key={w.hook} className="card px-3.5 py-3 grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`${IDEA_TYPE[w.type].cls} !text-[11.5px]`}>
                  {i + 1} · {IDEA_TYPE[w.type].label}
                </span>
                <span className="caption mono">{w.time}</span>
              </div>
              <div className="font-semibold text-[14px] leading-snug">&ldquo;{w.hook}&rdquo;</div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 content-start">
          <div className="well p-3.5 grid gap-2.5">
            <div className="label">Creators ahead of you</div>
            {LENA_AHEAD.map((a) => (
              <div key={a.handle} className="flex items-center gap-2 min-w-0">
                <Avatar name={a.handle} size={24} ring />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">@{a.handle}</div>
                  <div className="caption">{aheadLine(a.followers, LENA.followers)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="well p-3.5">
            <div className="label">Last week&apos;s idea, 48 hours later</div>
            <div className="font-semibold text-[13.5px] mt-1.5 leading-snug">&ldquo;{LENA_SCORECARD.hook}&rdquo;</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="display text-[24px] text-pos tnum">{times(LENA_SCORECARD.times)}</span>
              <span className="caption">your typical · {compact(LENA_SCORECARD.views)} views</span>
            </div>
            <div className="caption mt-1">Next one builds on it.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ kicker, title, body, points, visual, flip = false, stack = false }: { kicker: string; title: string; body: string; points: string[]; visual: React.ReactNode; flip?: boolean; stack?: boolean }) {
  if (stack) {
    // A wide visual (a full script) gets the full width, under its text.
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
        <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end">
          <div>
            <span className="kicker">{kicker}</span>
            <h2 className="display text-[clamp(26px,3.6vw,36px)] mt-3">{title}</h2>
            <p className="text-ink-2 text-[16px] leading-[1.6] mt-3 max-w-[48ch]">{body}</p>
          </div>
          <ul className="list-none p-0 m-0 mt-5 grid gap-2.5 text-[15px]">
            {points.map((p) => (
              <li key={p} className="flex gap-2.5">
                <Check />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">{visual}</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:gap-14 lg:grid-cols-2 items-center">
      <div className={flip ? "lg:order-2" : ""}>
        <span className="kicker">{kicker}</span>
        <h2 className="display text-[clamp(26px,3.6vw,36px)] mt-3">{title}</h2>
        <p className="text-ink-2 text-[16px] leading-[1.6] mt-3 max-w-[48ch]">{body}</p>
        <ul className="list-none p-0 m-0 mt-5 grid gap-2.5 text-[15px]">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5">
              <Check />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>{visual}</div>
    </div>
  );
}

function ShopCard() {
  return (
    <div className="card p-5 grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={SHOP.handle} size={32} />
          <div className="min-w-0">
            <div className="font-semibold text-[14px] truncate">{SHOP.name}</div>
            <div className="caption">
              @{SHOP.handle} · {SHOP.city} · {compact(SHOP.followers)} followers
            </div>
          </div>
        </div>
        <span className="pill">Business</span>
      </div>
      <div className="well p-3.5 grid gap-1">
        <div className="label">Built around what you sell</div>
        <div className="text-[13.5px] text-ink-2">
          {SHOP.product} · {SHOP.offer}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="font-semibold text-[15px] leading-snug">&ldquo;{SHOP.hook}&rdquo;</div>
        <ol className="list-none p-0 m-0 grid gap-1.5 text-[13.5px] text-ink-2">
          {SHOP.beats.map((b, i) => (
            <li key={b} className="flex gap-2">
              <span className="mono text-ink-3">{i + 1}</span>
              {b}
            </li>
          ))}
        </ol>
      </div>
      <div className="border-t border-line pt-3">
        <div className="label">A competitor in {SHOP.city}</div>
        <div className="text-[13.5px] mt-1">
          @{SHOP.competitor.handle}&apos;s top post this month: &ldquo;{SHOP.competitor.topPost}&rdquo;,{" "}
          <b className="tnum">{compact(SHOP.competitor.views)} views</b>, {times(Math.round((SHOP.competitor.views / SHOP.typical) * 10) / 10)} your typical.
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: "How it works and pricing — TRND for creators" };

/** Everything behind the first screen: what's wrong with their videos, the plan, pricing, questions. */
export default function PricingPage() {
  return (
    <div>
      <SiteNav />

      <section className="wrap pt-[clamp(40px,7vw,88px)] pb-14 grid gap-5 justify-items-center text-center">
        <span className="kicker">For TikTok creators and businesses</span>
        <h1 className="display text-[clamp(34px,5.6vw,60px)] max-w-[900px]">Make every post go viral.</h1>
        <p className="text-ink-2 text-[17.5px] max-w-[58ch] leading-[1.55]">
          Your posts aren&apos;t flopping by accident. We read your videos against the creators a step ahead of you and tell you what&apos;s killing them, then
          script your next three.
        </p>
        <Link href="/" className="btn btn-primary btn-lg">
          Check my posts
        </Link>
      </section>

      <section className="wrap pb-20" aria-label="An example plan">
        <Mockup />
        <p className="caption text-center mt-3">An example account with invented numbers.</p>
      </section>

      <section id="how" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20">
          <span className="kicker">How it works</span>
          <h2 className="display text-[clamp(26px,3.6vw,36px)] mt-3 max-w-[640px]">From your handle to three videos, and back.</h2>
          <ol className="list-none p-0 m-0 mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-line pt-5">
                <span className="text-[13px] font-medium text-ink-3 tnum">0{i + 1}</span>
                <h3 className="heading text-[17px] mt-2.5">{s.title}</h3>
                <p className="text-[14.5px] text-ink-2 leading-[1.6] mt-1.5">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-line bg-subtle">
        <div className="wrap py-16 sm:py-24 grid gap-20 sm:gap-28">
          <Feature
            kicker="What's wrong"
            title="Find out what's killing your posts."
            body="Your videos aren't flopping by accident. We read every one against your own best and against the creators a step ahead of you, and tell you, bluntly, what's holding them back."
            points={["How many of your videos never get past your followers", "The one thing killing your posts, from your own videos", "What the creators ahead of you do that you don't"]}
            visual={<DiagnosisCard handle={LENA.handle} followers={LENA.followers} d={LENA_DIAGNOSIS} gap={LENA_GAP} killer={LENA_KILLER} fix={LENA_IDEA.hook} />}
          />
          <Feature
            flip
            kicker="The gap"
            title="Know exactly how far behind you are."
            body="Your typical video, next to the typical video of creators 2–5× your size in your niche. Not the biggest names on the app: the accounts you could grow into next."
            points={["Your typical views, from your settled videos", "The creators ahead of you, matched from your niche's hashtags", "In dollars when you're on Creator Rewards, with the rate we assume"]}
            visual={
              <GapCard gap={LENA_GAP}>
                <Link href="/" className="btn btn-primary self-start">
                  Check my posts
                </Link>
              </GapCard>
            }
          />
          <Feature
            stack
            kicker="The plan"
            title="Three videos, scripted, every week."
            body="Each idea builds on a video that already worked: one of yours that beat your usual, or one that helped a creator ahead of you get there. With how to make it yours, never a copy."
            points={["Hook and script, second by second", "Sound, hashtags and when to post", "Checked 48 hours after you post it"]}
            visual={<IdeaCard idea={LENA_IDEA} rank={1} planId="sample" source={LENA_SOURCE} normal={LENA_NORMAL} run={null} open sample />}
          />
          <Feature
            kicker="For businesses"
            title="Scripts built around what you sell."
            body="Shops, clinics, realtors, med spas and restaurants post on TikTok too. Tell TRND your products, offers and city, and your scripts sell them, measured against the local accounts you compete with."
            points={["Your products and offers in every script", "Local competitors' best posts, read every week", "Up to 5 accounts"]}
            visual={<ShopCard />}
          />
        </div>
      </section>

      <section id="pricing" className="border-t border-line scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-8">
          <div className="text-center grid gap-3 justify-items-center">
            <span className="kicker">Pricing</span>
            <h2 className="display text-[clamp(26px,3.6vw,36px)]">Start free. Pay when you want all three.</h2>
            <p className="text-ink-2 max-w-[56ch]">Free shows you the gap and one scripted idea a week. Creator gives you three, checked after you post.</p>
          </div>
          <Pricing start="/" />
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-subtle scroll-mt-14">
        <div className="wrap py-16 sm:py-20 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <span className="kicker">FAQ</span>
            <h2 className="display text-[clamp(26px,3.6vw,36px)] mt-3">Questions</h2>
            <p className="text-ink-2 mt-3">
              Anything else?{" "}
              <a className="text-ink underline" href="mailto:hello@usetrnd.com">
                hello@usetrnd.com
              </a>
            </p>
          </div>
          <div className="card divide-y divide-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5">
                <summary className="flex justify-between gap-4 py-4 font-semibold text-[15.5px]">
                  {f.q}
                  <span className="text-ink-3 transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
                </summary>
                <p className="pb-5 text-ink-2 leading-[1.65]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="wrap py-10 grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] items-start text-[14px] text-ink-2">
          <div className="grid gap-2">
            <Brand size={14} />
            <p className="text-ink-3 max-w-[40ch]">Weekly video plans for TikTok creators and businesses, from public data only.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/pricing#how" className="hover:text-ink">
              How it works
            </Link>
            <Link href="/pricing#pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/pricing#faq" className="hover:text-ink">
              FAQ
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
            <a href="https://usetrnd.com" className="hover:text-ink">
              TRND for brands
            </a>
          </nav>
        </div>
        <div className="wrap pb-8 caption">© {new Date().getFullYear()} TRND. Not affiliated with TikTok.</div>
      </footer>
    </div>
  );
}
