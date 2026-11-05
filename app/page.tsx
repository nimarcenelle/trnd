import Link from "next/link";

import EssaySample from "@/components/admitted/essay-sample";
import OddsToy from "@/components/admitted/odds-toy";
import GuideOffer from "@/components/admitted/guide-offer";
import ProductShot from "@/components/admitted/product-shot";
import RequestSchool from "@/components/admitted/request-school";
import { FACTORS, SOURCES } from "@/components/admitted/sample";
import { SplitBar, SplitLegend } from "@/components/admitted/split";
import Brand from "@/components/brand";
import { IconArrowRight, IconCheck } from "@/components/icons";
import SiteNav from "@/components/site-nav";
import { shortName } from "@/lib/admitted/list";
import { PENDING_SCHOOLS, SCHOOLS } from "@/lib/admitted/schools";

const STEPS = [
  { title: "Enter your numbers", body: "Your schools, GPA, SAT or ACT and home state. No account, no email." },
  { title: "See the split", body: "Your odds at each school, and how much of each number is locked and how much is still movable." },
  { title: "Get the top fix, free", body: "The next move at each school, named. Act on it with us or without us." },
  { title: "Fix the movable part", body: "Our AI rates every draft, marks what costs you most and helps you rewrite it in your voice. $9.99 a week." },
];

const PROOF = [
  { value: "1 click", label: "from any number to its source page" },
  { value: "0", label: "numbers from surveys or forum posts" },
];

const FREE = ["Per-school odds with sources", "Locked and movable split", "Your top fix, named"];

const INCLUDED = ["AI rates your essay against six criteria", "Line-by-line fixes for what costs you most", "Rewrites in your voice", "Unlimited essays and revisions"];

const FAQ = [
  {
    q: "Where do the odds come from?",
    a: "From each college's Common Data Set: the GPA and test-score ranges, admit rates by round and admission factors the college publishes about itself. Every number links to the section it came from, so you can check it.",
  },
  {
    q: "What does locked and movable mean?",
    a: "Locked is the part of your odds set by what you can no longer change this cycle: GPA, scores, the courses you took. Movable is the part your application still decides: the round you apply in, your essays, your recommendation letters and how your activities read. How far essays and letters move it depends on what they say.",
  },
  {
    q: "Do you write my essay for me?",
    a: "No. Admitted is an AI tool: it rates your draft, shows what to fix, and rewrites from your own details and sentences. You decide what to keep.",
  },
  {
    q: "Are the odds a guarantee?",
    a: "No. They are the published numbers applied to your profile. People read applications, and no tool can promise an admit.",
  },
  {
    q: "How does the essay review work?",
    a: "Our AI rates your draft against six criteria, marks the lines costing you most and says what to fix. Then it asks for the details only you know and rewrites from those and your draft, in your voice. The same draft always gets the same rating.",
  },
  {
    q: "Who sees my essays?",
    a: "Reviews and rewrites are saved encrypted, and we never sell your writing. OpenAI processes each draft to review it and does not train on it. The privacy policy has the details.",
  },
  {
    q: "Can I cancel?",
    a: "Anytime, from Account on the essay page. You keep access until the end of the week you paid for.",
  },
  {
    q: "What if my scores or my list change?",
    a: "Re-run it. A new score, school or draft updates every number. Odds are free to re-run.",
  },
  {
    q: "What about MBA, law and med?",
    a: "Same engine, different inputs: GMAT or GRE and work years for MBA, LSAT for law, MCAT and science GPA for med. Undergrad opens first.",
  },
];

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[14px]">
      <IconCheck className="text-brand mt-[3px] shrink-0" />
      {children}
    </li>
  );
}

function Feature({ kicker, title, body, points, visual, flip = false }: { kicker: string; title: string; body: string; points: string[]; visual: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:gap-16 lg:grid-cols-2 items-center">
      <div className={flip ? "lg:order-2" : ""}>
        <p className="kicker">{kicker}</p>
        <h3 className="section-title text-[32px] sm:text-[40px] mt-3">{title}</h3>
        <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[480px]">{body}</p>
        <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-2.5">
          {points.map((p) => (
            <Check key={p}>{p}</Check>
          ))}
        </ul>
      </div>
      <div className={`stage ${flip ? "lg:order-1" : ""}`}>{visual}</div>
    </div>
  );
}

function SplitCard() {
  return (
    <div className="card p-6 w-full max-w-[520px] lg:ml-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="caption">{FACTORS.school}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[30px] font-semibold tnum tracking-tight">{FACTORS.odds}%</span>
            <span className="text-[13px] text-ink-3 tnum whitespace-nowrap">
              → up to <span className="text-brand font-semibold">{FACTORS.withFixes}%</span>
            </span>
          </div>
        </div>
        <SplitLegend className="mt-1" />
      </div>
      <SplitBar className="mt-4 !h-2" locked={64} movable={36} />
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="text-[12px] font-medium text-ink-3">Locked</div>
          <ul className="list-none p-0 m-0 mt-2 flex flex-col gap-2 text-[13px]">
            {FACTORS.locked.map((f) => (
              <li key={f} className="text-ink-2">
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[12px] font-medium text-brand">Movable</div>
          <ul className="list-none p-0 m-0 mt-2 flex flex-col gap-2 text-[13px]">
            {FACTORS.movable.map((f) => (
              <li key={f.label} className="flex justify-between gap-3">
                <span>{f.label}</span>
                {f.kind === "round" && <span className="tnum text-brand font-medium whitespace-nowrap">+{f.gain} pts</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />

      <section id="start" className="relative scroll-mt-14 wash-top">
        <div className="dot-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
        <div className="relative wrap pt-14 sm:pt-20 pb-16 sm:pb-20">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14 items-center">
            <div>
                  <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-[var(--soft)] text-[13px] font-medium text-[var(--soft-ink)]">
                    <i className="w-1.5 h-1.5 rounded-full bg-[var(--soft-ink)]" /> For college applicants and their parents
                  </span>
                  <h1 className="display text-[44px] sm:text-[56px] mt-6">
                    Your real odds.
                    <span className="block text-[var(--headline-2)] [text-wrap:balance]">And the part you can still move.</span>
                  </h1>
                  <p className="text-[16px] sm:text-[18px] text-ink-2 leading-[1.6] mt-5 max-w-[560px]">Admit odds at every school on your list, from the numbers colleges publish, split into what your stats already decided and what your application can still change. Then we change it.</p>
              <Link href="/odds" className="btn btn-primary btn-lg mt-8 w-full sm:w-auto">
                See my odds <IconArrowRight />
              </Link>
              <p className="caption mt-3">Four questions. Free, no account: your odds, the locked and movable split, and your top fix.</p>
            </div>
            <OddsToy />
          </div>
          <div className="mt-14 border-t border-line pt-6 flex flex-col lg:flex-row lg:items-baseline justify-between gap-x-8 gap-y-2 text-[14px]">
            <p className="text-ink-2 tnum">{SCHOOLS.map((s) => shortName(s.name)).join(" · ")}</p>
            <p className="text-ink-3 shrink-0">{PENDING_SCHOOLS.map((s) => shortName(s.name)).join(", ").replace(/, ([^,]*)$/, " and $1")} are next.</p>
          </div>
          <RequestSchool />
          <div className="mt-16 sm:mt-20">
            <ProductShot />
            <p className="caption mt-3 text-center">Two sample applicants on real lists. Switch applicant or view in the side nav.</p>
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-line scroll-mt-14">
        <div className="wrap py-20 sm:py-28">
          <p className="kicker">How it works</p>
          <h2 className="section-title text-[32px] sm:text-[40px] mt-3 max-w-[640px]">From your numbers to your next draft.</h2>
          <ol className="list-none p-0 m-0 mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-line pt-6">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--soft)] text-[13px] font-semibold text-[var(--soft-ink)] tnum">{i + 1}</span>
                <h3 className="heading text-[16px] mt-3">{s.title}</h3>
                <p className="text-[14px] text-ink-2 leading-[1.65] mt-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="border-t border-line scroll-mt-14">
        <div className="wrap py-20 sm:py-28 flex flex-col gap-24 sm:gap-32">
          <Feature
            kicker="Odds"
            title="Every number, split in two."
            body="Odds at each school, from the ranges that school publishes. Then the split: how much your stats already decided, how much is still yours to move, and what moves it."
            points={["Odds per school, with the source one click away", "Locked and movable, split on one bar", "The round sized in points. Essays and letters depend on what's in them."]}
            visual={<SplitCard />}
          />
          <Feature
            flip
            kicker="Essays"
            title="Your essay, rated and improved."
            body="An AI tool that rates your essay and helps you improve it. The lines costing you most are marked in place, each with what to do. You add the details only you know, and it rewrites in your voice."
            points={["An AI rating of every draft, line by line", "Personal statement and every supplement, revised through the cycle", "What changed, and how much stayed yours"]}
            visual={<EssaySample />}
          />
        </div>
      </section>

      <section id="data" className="scroll-mt-14 pb-20 sm:pb-28">
        <div className="wrap">
          <div className="rounded-[20px] bg-band text-band-ink px-6 py-14 sm:px-12 sm:py-20">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] lg:gap-14 items-center">
              <div>
                <p className="text-[13px] font-medium text-band-ink-3">The data</p>
                <h2 className="section-title text-[32px] sm:text-[40px] mt-3 [text-wrap:balance]">Where the numbers come from.</h2>
                <p className="text-[16px] text-band-ink-3 leading-[1.65] mt-5 max-w-[520px]">
                  Most four-year colleges publish a Common Data Set each year: admit rates by round, GPA and test-score ranges, and what they weigh. Our odds are those numbers applied to you. Check any of them yourself.
                </p>
              </div>
              <div className="rounded-[12px] bg-band-2 border border-band-line p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[14px] font-medium whitespace-nowrap">{SOURCES.school}</span>
                  <span className="text-[12px] text-band-ink-3 whitespace-nowrap">{SOURCES.edition}</span>
                </div>
                <ul className="list-none p-0 m-0 mt-4 divide-y divide-band-line text-[13px]">
                  {SOURCES.rows.map((r) => (
                    <li key={r.label} className="flex items-baseline gap-3 py-2.5">
                      <span className="flex-1 min-w-0 text-band-ink-3">{r.label}</span>
                      <span className="tnum font-medium whitespace-nowrap">{r.value}</span>
                      <span className="tnum text-[12px] text-band-ink-3 w-8 text-right">{r.section}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-band-ink-3 mt-3">Published by {SOURCES.short}. Section numbers on the right.</p>
              </div>
            </div>
            <div className="mt-12 grid gap-3 grid-cols-[minmax(0,1fr)] sm:grid-cols-2">
              {PROOF.map((p) => (
                <div key={p.label} className="rounded-[12px] bg-band-2 border border-band-line p-5 sm:p-6">
                  <div className="text-[40px] font-semibold tracking-[-0.04em] leading-none tnum">{p.value}</div>
                  <div className="text-[14px] text-band-ink-3 mt-4 leading-[1.5]">{p.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="guide" className="border-t border-line bg-subtle scroll-mt-14">
        <div className="wrap py-20 sm:py-24 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 items-center">
          <div>
            <p className="kicker">Free guide</p>
            <h2 className="section-title text-[32px] sm:text-[40px] mt-3">Anatomy of a winning essay.</h2>
            <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[520px]">What readers look for, the five parts of an essay that works, one example taken apart line by line, and ten checks for before you submit.</p>
            <GuideOffer />
            <p className="caption mt-3">We&apos;ll also send occasional essay tips. Unsubscribe anytime.</p>
          </div>
          <div className="hidden lg:block rounded-[12px] bg-band text-band-ink p-8 shadow-[var(--shadow-lg)] aspect-[8.5/11]">
            <div className="text-[12px] font-medium text-band-ink-3">A free guide for college applicants</div>
            <div className="text-[32px] font-semibold tracking-[-0.03em] leading-[1.05] mt-24">
              Anatomy of a <span className="block text-brand">winning essay.</span>
            </div>
            <div className="text-[12px] text-band-ink-3 mt-6">5 pages · PDF</div>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-line scroll-mt-14">
        <div className="wrap py-20 sm:py-28">
          <div className="text-center">
            <p className="kicker">Pricing</p>
            <h2 className="section-title text-[32px] sm:text-[40px] mt-3">Odds are free. Essays are $9.99 a week.</h2>
            <p className="text-[16px] text-ink-2 mt-3">Subscribe when you want your essays rated and improved. Cancel anytime.</p>
          </div>
          <div className="mt-12 grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-4 max-w-[880px] mx-auto items-stretch">
            <div className="card p-8 flex flex-col">
              <div className="text-[14px] font-semibold text-ink-2">Odds</div>
              <div className="text-[40px] font-semibold tnum mt-3">Free</div>
              <ul className="list-none p-0 m-0 mt-6 mb-8 flex flex-col gap-3">
                {FREE.map((f) => (
                  <Check key={f}>
                    <span className="text-[14px]">{f}</span>
                  </Check>
                ))}
              </ul>
              <Link href="/odds" className="btn btn-secondary btn-lg w-full mt-auto">
                See my odds
              </Link>
              <p className="caption text-center mt-3">No account, no email.</p>
            </div>
            <div className="card p-8 flex flex-col shadow-[var(--shadow-lg)]">
              <div className="text-[14px] font-semibold text-[var(--kicker)]">Essays</div>
              <div className="mt-3 flex items-baseline gap-1.5"><span className="text-[40px] font-semibold tnum">$9.99</span><span className="text-[14px] text-ink-3">a week</span></div>
              <p className="text-[13px] text-ink-2 mt-1">Billed weekly. Cancel anytime.</p>
              <ul className="list-none p-0 m-0 mt-6 mb-8 flex flex-col gap-3">
                {INCLUDED.map((f) => (
                  <Check key={f}>
                    <span className="text-[14px]">{f}</span>
                  </Check>
                ))}
              </ul>
              <Link href="/essay" className="btn btn-primary btn-lg w-full mt-auto">
                Fix the movable part
              </Link>
              
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-subtle scroll-mt-14">
        <div className="wrap py-20 sm:py-28 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <p className="kicker">FAQ</p>
            <h2 className="section-title text-[32px] sm:text-[40px] mt-3">Questions</h2>
            <p className="text-[14px] text-ink-2 mt-3">
              Anything else?{" "}
              <a className="text-ink underline" href="mailto:hello@usetrnd.com">
                hello@usetrnd.com
              </a>
            </p>
          </div>
          <div className="card divide-y divide-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex items-center justify-between gap-4 text-[14px] font-medium">
                  {f.q}
                  <span className="text-ink-3 text-[18px] leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="text-[14px] text-ink-2 leading-[1.7] mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line wash-bottom">
        <div className="wrap py-20 sm:py-28 flex flex-col items-center text-center">
          <h2 className="section-title text-[32px] sm:text-[40px] max-w-[760px]">See what is still yours to move.</h2>
          <Link href="/odds" className="btn btn-primary btn-lg mt-8">
            See my odds
          </Link>
        </div>
      </section>

      <footer className="border-t border-line mt-auto">
        <div className="wrap py-8 flex flex-col sm:flex-row gap-4 justify-between sm:items-center text-[13px] text-ink-3">
          <div className="flex items-center gap-4">
            <Brand size={12} />
            <span>© {new Date().getFullYear()} Admitted</span>
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
