import Link from "next/link";

import AdPreview from "@/components/app/ad-preview";
import Avatar from "@/components/app/avatar";
import Brief from "@/components/app/brief";
import Brand from "@/components/brand";
import { IconCheck } from "@/components/icons";
import SampleCreative from "@/components/sample/creative";
import { SAMPLE_ADS, type SampleAd } from "@/components/sample/market";
import ProductShot from "@/components/sample/product-shot";
import SiteNav from "@/components/site-nav";
import UrlStart from "@/components/url-start";
import { PRICE_LABEL } from "@/lib/billing";

const STEPS = [
  { title: "Enter your website", body: "TRND reads it, works out what you sell and who buys it, and finds the brands competing for the same customers." },
  { title: "See every ad they run", body: "Every active ad your competitors run on Facebook and Instagram, with the copy, the creative, the offer and the date it started." },
  { title: "Get a briefing every morning", body: "What changed overnight, what it means for you, and the ads worth making next, in your inbox and your dashboard." },
];

const INCLUDED = [
  "Up to 10 competitors, checked daily",
  "Every active Meta ad, analyzed",
  "Instagram and TikTok tracking",
  "Your brand profile and positioning",
  "Daily change alerts by email",
  "Ad ideas with creative briefs",
];

const FAQ = [
  {
    q: "Where does the data come from?",
    a: "Ads come from Meta's public Ad Library, which lists every active ad running on Facebook, Instagram, Messenger and Audience Network. Social numbers come from public Instagram and TikTok profiles. TRND reads both for you and your competitors every day, and keeps the history the platforms don't.",
  },
  {
    q: "How do you know which ads are working?",
    a: "Meta doesn't publish spend or results for commercial ads. What it does show is when each ad started. An ad still running after weeks is one a competitor keeps paying for, and several versions of the same idea means they're scaling it. TRND reads those signals across every competitor at once, and never claims more than they show.",
  },
  {
    q: "How are my competitors chosen?",
    a: "TRND suggests them from your website, and you confirm the list before anything is tracked. Add or remove competitors any time.",
  },
  {
    q: "Do I need to connect my ad account?",
    a: "No. TRND only reads public ads. Nothing touches your Meta account.",
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
  const [clearwell, tidewell, marlow, fenn] = SAMPLE_ADS;
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />

      <section className="relative">
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-subtle border-t border-line" aria-hidden />
        <div className="wrap relative pt-20 sm:pt-28 pb-16 sm:pb-24 flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-line bg-bg text-[12.5px] text-ink-2 shadow-[var(--shadow-sm)]">
            <span className="live-dot !w-1.5 !h-1.5" /> Always-on surveillance for paid social
          </span>
          <h1 className="display text-[40px] sm:text-[56px] lg:text-[64px] mt-6 max-w-[860px]">See every ad your competitors run, and what&apos;s working.</h1>
          <p className="text-[17px] sm:text-[18px] text-ink-2 leading-[1.6] mt-5 max-w-[620px]">
            TRND tracks your competitors&apos; Meta ads and social accounts every day, shows you which ads they keep paying for and where you stand, and tells you what changed.
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
          <h2 className="display text-[30px] sm:text-[38px] mt-3 max-w-[640px]">Set up in two minutes. Informed every morning after.</h2>
          <ol className="list-none p-0 m-0 mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
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
            body="An ad that's still running after months is one a competitor keeps funding. TRND sorts every competitor ad by how long it has run and tags its angle, hook and offer, so the winners are obvious."
            points={["Every active ad, longest-running first", "Angle, hook and offer on every ad", "The patterns the long-running ads share"]}
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
            kicker="What changed"
            title="Know the moment they make a move."
            body="New launches, ads they stopped, and ads that just proved themselves. TRND checks every day and emails you only when something changed, with what it means for your brand."
            points={["Daily checks on every competitor", "New, stopped and newly proven ads", "An email when there's something worth knowing"]}
            visual={
              <div className="card overflow-hidden max-w-[520px]">
                <div className="px-5 py-4 border-b border-line">
                  <div className="text-[12px] text-ink-3">From TRND · 7:02 AM</div>
                  <div className="text-[15px] font-semibold mt-1 leading-snug">Tidewell launched a 3-for-$79 refill bundle</div>
                </div>
                <div className="divide-y divide-line">
                  {[
                    { ad: tidewell, badge: "badge badge-pos", label: "New", line: "Year-supply bundle, 3 filters for $79" },
                    { ad: fenn, badge: "badge badge-warn", label: "Proven", line: "“Your shampoo isn't the problem” passed 128 days" },
                    { ad: marlow, badge: "badge badge-neg", label: "Stopped", line: "Two discount ads stopped after under 30 days" },
                  ].map(({ ad, badge, label, line }, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-11 h-11 rounded-md overflow-hidden border border-line shrink-0">
                        <SampleCreative spec={ad.creative} id={`mail-${i}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-semibold">{ad.rival}</span>
                          <span className={badge}>{label}</span>
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
            flip
            kicker="Where you stand"
            title="See yourself the way the market does."
            body="TRND profiles your brand from your site and your own ads, then puts you next to every competitor: price, audience, message, ad volume and social reach. You see what only you do, what they all do that you don't, and the lanes nobody has taken."
            points={["Your brand profile, which you can correct", "Your ads and social, side by side with theirs", "Gaps you could own, named specifically"]}
            visual={
              <div className="card p-5 max-w-[520px]">
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
            kicker="What to make next"
            title="Turn their winners into your next ads."
            body="Every report ends with ad ideas modeled on what's working for your competitors, written for your brand, with a brief a creator can shoot from."
            points={["Ideas grounded in the ads that prove them", "A hook, format and shot list for each", "Written in your voice, not theirs"]}
            visual={
              <div className="card p-6 max-w-[520px] lg:ml-auto">
                <div className="caption">Idea 1</div>
                <div className="text-[17px] font-semibold mt-1">The &ldquo;it was my water&rdquo; review, Halo version</div>
                <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-2">
                  Clearwell&apos;s review ad has run 94 days across 6 versions. Lead with the problem, not the product.
                </p>
                <div className="well p-4 mt-4">
                  <Brief text={"Hook: I spent $400 on hair masks. The problem was my shower.\nFormat: 9:16 selfie video, 20 to 30 seconds\nShow: hair close-up, the 30-second install, week three\nOffer: none, run as evergreen proof"} />
                </div>
                <div className="flex items-center gap-2.5 mt-4">
                  <span className="caption">Modeled on</span>
                  <div className="w-9 h-9 rounded-md overflow-hidden border border-line">
                    <SampleCreative spec={clearwell.creative} id="brief-0" />
                  </div>
                  <div className="w-9 h-9 rounded-md overflow-hidden border border-line">
                    <SampleCreative spec={fenn.creative} id="brief-1" />
                  </div>
                </div>
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
          <h2 className="display text-[30px] sm:text-[40px] mt-6 max-w-[640px]">See what your competitors are running today.</h2>
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
