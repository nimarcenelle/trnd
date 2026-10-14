import Link from "next/link";

import AdPreview from "@/components/app/ad-preview";
import Avatar from "@/components/app/avatar";
import Brand from "@/components/brand";
import { IconCheck } from "@/components/icons";
import SampleCreative from "@/components/sample/creative";
import { SAMPLE_ADS, type SampleAd } from "@/components/sample/market";
import ProductShot from "@/components/sample/product-shot";
import SiteNav from "@/components/site-nav";
import UrlStart from "@/components/url-start";
import { PRICE_LABEL } from "@/lib/billing";

const STEPS = [
  { title: "Tell us your business", body: "Enter your website. TRND learns what you sell, who you serve, how you're priced and what makes you different. Correct anything, and add your goals." },
  { title: "We watch them every day", body: "TRND follows your competitors' public marketing daily: what they launch, what they promote, what they change and what they keep paying for." },
  { title: "We connect the dots", body: "Moves rarely come alone. A new message, a bundle offer and a run of savings ads are one push, not three events. TRND links them and reads them through your business." },
  { title: "You get your next move", body: "Each move ranked: get ahead, win the choice, counter, or ignore. With a campaign brief ready to test: angle, hook, offer, creative and audience." },
];

const INCLUDED = [
  "Up to 10 competitors, checked daily",
  "Every public move, tracked daily",
  "Opportunities ranked for your business",
  "Campaign briefs ready to test",
  "Instagram and TikTok tracking",
  "An email when something changes",
];

const FAQ = [
  {
    q: "Where does the data come from?",
    a: "Public information only: what your competitors put out to win customers. TRND reads it every day, keeps the history, and never touches anything private.",
  },
  {
    q: "How do you know what's working for them?",
    a: "We don't, exactly, and we say so. Competitors don't publish their results. What we can see is what they keep paying for and keep repeating: an ad still running after weeks, several versions of one idea, an offer pushed again and again. TRND reads those signals, tells you how confident it is, and never claims more than they show.",
  },
  {
    q: "How are my competitors chosen?",
    a: "TRND suggests them from your website, and you confirm the list before anything is tracked. Add or remove competitors any time.",
  },
  {
    q: "Do I need to connect my ad account?",
    a: "No. TRND reads public ads, so nothing touches your Meta account. If you want advice tuned to what has worked for you, upload an Ads Manager export (CSV) on the Business DNA page.",
  },
];

function SampleAdCard({ ad, i }: { ad: SampleAd; i: number }) {
  const status =
    ad.status === "new" ? (
      <span className="badge badge-pos">
        <span className="status-dot" />
        New
      </span>
    ) : ad.days >= 21 ? (
      <span className="badge badge-warn">
        <span className="status-dot" />
        Proven
      </span>
    ) : (
      <span className="badge badge-pos">
        <span className="status-dot" />
        Active
      </span>
    );
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-3.5 h-11 border-b border-line">
        {status}
        <span className="text-[12px] text-ink-3 tnum">
          {ad.days} days{ad.versions > 1 ? ` · ${ad.versions} versions` : ""}
        </span>
      </div>
      <AdPreview page={ad.rival} body={ad.body} title={ad.title} cta={ad.cta} domain={ad.domain} media={<SampleCreative spec={ad.creative} id={`card-${i}`} />} />
      <div className="px-3.5 py-3 border-t border-line flex gap-1.5">
        <span className="badge badge-outline">{ad.angle}</span>
        {ad.offer && <span className="badge badge-outline">{ad.offer}</span>}
      </div>
    </div>
  );
}

function Feature({ kicker, title, body, points, visual, flip = false }: { kicker: string; title: string; body: string; points: string[]; visual: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:gap-16 lg:grid-cols-2 items-center">
      <div className={flip ? "lg:order-2" : ""}>
        <p className="kicker">{kicker}</p>
        <h3 className="display text-[30px] sm:text-[34px] mt-3">{title}</h3>
        <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[480px]">{body}</p>
        <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14.5px]">
              <IconCheck className="text-brand mt-[3px] shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? "lg:order-1" : ""}>{visual}</div>
    </div>
  );
}

export default function Home() {
  const [clearwell, tidewell, , fenn] = SAMPLE_ADS;
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />

      <section className="relative">
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-subtle border-t border-line" aria-hidden />
        <div className="wrap relative pt-20 sm:pt-28 pb-16 sm:pb-24 flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-line bg-bg text-[12.5px] text-ink-2 shadow-[var(--shadow-sm)]">
            <span className="live-dot !w-1.5 !h-1.5" /> Competitive intelligence for marketers
          </span>
          <h1 className="display text-[40px] sm:text-[56px] lg:text-[64px] mt-6 max-w-[900px]">Know what your competitors are doing. Know what to do next.</h1>
          <p className="text-[17px] sm:text-[18px] text-ink-2 leading-[1.6] mt-5 max-w-[660px]">
            Your competitors are constantly changing what they sell, what they say, and how they advertise. TRND watches every move they make, then shows you where your business can get ahead, stand out, or fight back.
          </p>
          <div className="mt-8 w-full flex justify-center">
            <UrlStart />
          </div>
          <p className="caption mt-3">Free for 14 days. No credit card required.</p>
          <div className="mt-14 sm:mt-16 w-full max-w-[1080px]">
            <ProductShot />
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-line">
        <div className="wrap py-20 sm:py-28">
          <p className="kicker">How it works</p>
          <h2 className="display text-[30px] sm:text-[38px] mt-3 max-w-[640px]">From competitor moves to your next campaign.</h2>
          <ol className="list-none p-0 m-0 mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-line pt-6">
                <span className="text-[13px] font-medium text-ink-3 tnum">0{i + 1}</span>
                <h3 className="heading text-[17px] mt-3">{s.title}</h3>
                <p className="text-[14.5px] text-ink-2 leading-[1.65] mt-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="border-t border-line bg-subtle">
        <div className="wrap py-20 sm:py-28 flex flex-col gap-24 sm:gap-32">
          <Feature
            kicker="What's working"
            title="Know which ads they keep paying for."
            body="An ad that's still running after months is one a competitor keeps funding. TRND reads every competitor ad, tags its angle, hook and offer, and marks what they're testing and what they're scaling."
            points={["Every active ad, longest-running first", "Testing vs. scaling, from age and versions", "The patterns the long-running ads share"]}
            visual={
              <div className="grid grid-cols-2 gap-4 max-w-[560px] lg:ml-auto">
                <SampleAdCard ad={fenn} i={0} />
                <div className="pt-10">
                  <SampleAdCard ad={clearwell} i={1} />
                </div>
              </div>
            }
          />
          <Feature
            flip
            kicker="Connect the dots"
            title="See the strategy, not just the moves."
            body="One move is noise. A new message, a bundle offer and a run of savings ads in the same week is a strategy. TRND groups related moves, tells repeated messaging from new pushes, and emails you when it matters."
            points={["One timeline of every move they make", "Related moves grouped into one pattern", "New pushes told apart from the same old offer"]}
            visual={
              <div className="card overflow-hidden max-w-[520px]">
                <div className="px-5 py-4 border-b border-line">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-pos">New push</span>
                    <span className="text-[12px] text-ink-3">This week · 3 signals</span>
                  </div>
                  <div className="text-[15px] font-semibold mt-2 leading-snug">Tidewell looks to be making an affordability push</div>
                </div>
                <div className="divide-y divide-line">
                  {[
                    { icon: <Avatar name="Tidewell" size={24} />, tag: "New message", badge: "badge badge-info", line: "Now leading with “Clean water, half the price”" },
                    { icon: <Avatar name="Tidewell" size={24} />, tag: "New offer", badge: "badge badge-warn", line: "“3 filters for $79”, pushed twice since Monday" },
                    { icon: <SampleCreative spec={tidewell.creative} id="dots-0" />, tag: "New ads", badge: "badge badge-pos", line: "4 savings-themed ads launched in 6 days" },
                  ].map(({ icon, tag, badge, line }, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-11 h-11 rounded-md overflow-hidden border border-line shrink-0 grid place-items-center bg-subtle text-ink-2">{icon}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-semibold">Tidewell</span>
                          <span className={badge}>{tag}</span>
                        </div>
                        <div className="text-[13px] text-ink-2 truncate mt-0.5">{line}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            }
          />
          <Feature
            kicker="Built around your business"
            title="Intelligence built around your business."
            body="TRND learns what you sell, who you serve, what makes you different and what you want to achieve. Every competitor move is read through that, so the question it answers is yours: what is the smartest marketing move for my business right now?"
            points={["Your business profile and goals, which you control", "Your ads and social, side by side with theirs", "Gaps in competitor positioning you could own"]}
            visual={
              <div className="card p-5 max-w-[520px] lg:ml-auto">
                <div className="caption">You vs. your competitors</div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {[
                    { t: "Only you", c: "text-pos", items: ["Built-in refill subscription", "Vitamin C claim"] },
                    { t: "Only them", c: "text-neg", items: ["Customer testimonials", "Video ads"] },
                    { t: "Open lanes", c: "text-warn", items: ["Before/after for skin", "Renters, no-tools install"] },
                  ].map((col) => (
                    <div key={col.t}>
                      <div className={`text-[12.5px] font-semibold ${col.c}`}>{col.t}</div>
                      <ul className="list-disc pl-4 m-0 mt-2 flex flex-col gap-1 text-[12.5px] text-ink-2 leading-[1.45]">
                        {col.items.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-line pt-4 grid grid-cols-3 gap-3 text-[12.5px]">
                  {[
                    ["Halo (you)", "8.4K", "2 ads"],
                    ["Clearwell", "46.2K", "14 ads"],
                    ["Fenn", "15.9K", "8 ads"],
                  ].map(([n, f, a]) => (
                    <div key={n}>
                      <div className="font-medium">{n}</div>
                      <div className="text-ink-3 tnum">
                        {f} followers · {a}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            }
          />
          <Feature
            flip
            kicker="Your next move"
            title="Get ahead, stand out, or fight back."
            body="Every move is classified for you: get ahead of an opening, win the choice where everyone sounds the same, counter a threat with something only you can say, or ignore what doesn't fit. Each comes ranked by relevance, urgency and confidence, with a campaign brief ready to test."
            points={["Get ahead · Win the choice · Counter · Ignore", "Ranked for your customers, economics and goals", "Angle, hook, offer, creative, audience and the test to run"]}
            visual={
              <div className="card p-6 max-w-[520px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="badge badge-warn">Counter</span>
                  <span className="caption">Urgency high · Confidence medium</span>
                </div>
                <div className="text-[17px] font-semibold mt-3">Answer Tidewell&apos;s price push with proof, not a discount</div>
                <dl className="m-0 mt-3 flex flex-col gap-2.5 text-[13.5px] leading-[1.6]">
                  <div>
                    <dt className="text-[12px] font-medium text-ink-3">What we saw</dt>
                    <dd className="m-0">A new “half the price” message, a 3-for-$79 bundle pushed twice in a week, 4 savings ads.</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-medium text-ink-3">For you</dt>
                    <dd className="m-0 text-ink-2">Your margin can&apos;t match $79, but your filter lasts twice as long. Cost per month is your win.</dd>
                  </div>
                </dl>
                <blockquote className="m-0 mt-4 border-l-2 border-ink pl-3 text-[15px] font-medium leading-[1.45]">&ldquo;Cheaper filters, twice the refills. Do the math.&rdquo;</blockquote>
                <dl className="m-0 mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.5]">
                  {[
                    ["Offer", "Free first refill"],
                    ["Format", "Static comparison + 9:16 cost breakdown"],
                    ["Test", "Cost-per-month vs. your best ad, 7 days"],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="m-0 text-ink-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            }
          />
        </div>
      </section>

      <section id="pricing" className="border-t border-line">
        <div className="wrap py-20 sm:py-28">
          <div className="text-center">
            <p className="kicker">Pricing</p>
            <h2 className="display text-[30px] sm:text-[38px] mt-3">One plan, everything included.</h2>
            <p className="text-[16px] text-ink-2 mt-3">Try it free for 14 days. No credit card required.</p>
          </div>
          <div className="card mt-12 max-w-[440px] mx-auto p-8 shadow-[var(--shadow-md)]">
            <div className="text-[14px] font-semibold">TRND</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="display text-[44px] tnum">{PRICE_LABEL.replace("/mo", "")}</span>
              <span className="text-ink-3 text-[14px]">per month</span>
            </div>
            <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-3">
              {INCLUDED.map((f) => (
                <li key={f} className="flex gap-2.5 text-[14px]">
                  <IconCheck className="text-brand mt-[3px] shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn btn-primary btn-lg w-full mt-8">
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-subtle">
        <div className="wrap py-20 sm:py-28 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <p className="kicker">FAQ</p>
            <h2 className="display text-[30px] sm:text-[38px] mt-3">Questions</h2>
            <p className="text-[15px] text-ink-2 mt-3">
              Anything else?{" "}
              <a className="text-ink underline" href="mailto:hello@usetrnd.com">
                hello@usetrnd.com
              </a>
            </p>
          </div>
          <div className="card divide-y divide-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex items-center justify-between gap-4 text-[15px] font-medium">
                  {f.q}
                  <span className="text-ink-3 text-[18px] leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="text-[14.5px] text-ink-2 leading-[1.7] mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-20 sm:py-28 flex flex-col items-center text-center">
          <div className="flex -space-x-2">
            {["Clearwell", "Tidewell", "Marlow", "Fenn"].map((n) => (
              <span key={n} className="rounded-full ring-2 ring-bg">
                <Avatar name={n} size={32} />
              </span>
            ))}
          </div>
          <h2 className="display text-[30px] sm:text-[40px] mt-6 max-w-[680px]">Stop watching competitors. Start outmaneuvering them.</h2>
          <div className="mt-8 w-full flex justify-center">
            <UrlStart cta="Start free trial" />
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="wrap py-8 flex flex-col sm:flex-row gap-4 justify-between sm:items-center text-[13px] text-ink-3">
          <div className="flex items-center gap-4">
            <Brand size={12} />
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
