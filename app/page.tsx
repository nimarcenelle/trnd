import Link from "next/link";

import EssaySample from "@/components/essayodds/essay-sample";
import LogoStrip from "@/components/essayodds/logo-strip";
import OddsToy from "@/components/essayodds/odds-toy";
import PlanCards, { Agree } from "@/components/essayodds/plan-cards";
import ProductShot from "@/components/essayodds/product-shot";
import Brand from "@/components/brand";
import { IconArrowRight, IconCheck } from "@/components/icons";
import SiteNav from "@/components/site-nav";
import { daysToRegularDecision } from "@/lib/essayodds/deadline";
import { PLANS } from "@/lib/essayodds/plans";
import { SCHOOLS } from "@/lib/essayodds/schools";
import { FACTORS } from "@/components/essayodds/sample";

/** The deadline countdown is worked out on the server, so the page rebuilds hourly. */
export const revalidate = 3600;

const FAQ = [
  { q: "What do I get?", a: "Your odds at every school on your list, your essay score with every weak line marked, rewrites in your voice, every supplement and revision re-scored, your activity and honors lists tightened, and a Final Read of everything before you submit." },
  { q: "Do essays really matter that much?", a: "At the most selective schools, most applicants have strong grades and scores, so those stop separating anyone. Essays are where readers learn who you are, and they're the one part of your application you can still improve before you submit." },
  { q: "Is it worth it with deadlines this close?", a: "That's when it matters most. Most regular-decision applications are due January 1. An essay that reads stronger is the one thing still in your control, and you can rework every supplement this week." },
  { q: "Is using EssayOdds cheating?", a: "No. It works like a tough reader: it scores your draft, marks what's weak and rewrites only from your own details. You choose every line that goes in." },
  { q: "Will my essay still sound like me?", a: "Yes. Before a rewrite it asks for details only you know, keeps your sentences where they work, shows how much stayed yours and flags anything you didn't write." },
  { q: "Where do the odds come from?", a: "From each college's Common Data Set: admit rates by round and GPA and test ranges, applied to you, then adjusted by how your essay reads." },
  { q: "Who built this?", a: "Ivy League grads who've been through the process and know what admissions readers look for." },
  { q: "Can a parent pay?", a: "Yes. Send them essayodds.com/pay. They check out and get one link to send you." },
  { q: "Is it a subscription?", a: "Your choice. The RD Pass is one payment that covers every essay until January 15, with nothing to cancel. Weekly is $19 a week and renews until you cancel, in two clicks from your account." },
];

const HARVARD = SCHOOLS.find((s) => s.id === "harvard")!;
const fmt = (n: number) => n.toLocaleString("en-US");

/** The sales letter: at the top schools the numbers stop deciding, the essays do. Every figure is Harvard's own Common Data Set. */
function WhyEssays() {
  const stats = [
    { value: fmt(HARVARD.applicants), label: "applied to Harvard" },
    { value: fmt(HARVARD.admitted), label: "got in" },
    { value: `${HARVARD.sat25}–${HARVARD.sat75}`, label: "SAT, middle half of the class" },
  ];
  return (
    <section className="border-t border-line">
      <div className="wrap py-20 sm:py-24 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-16 items-start">
        <div className="max-w-[620px]">
          <p className="kicker">Why essays decide it</p>
          <h2 className="section-title text-[32px] sm:text-[40px] mt-3">
            Your numbers get you read.
            <span className="block text-[var(--headline-2)]">Your essays get you in.</span>
          </h2>
          <div className="flex flex-col gap-4 mt-6 text-[17px] text-ink-2 leading-[1.7]">
            <p>At the schools you&apos;re applying to, great grades and scores are the starting line. A quarter of Harvard&apos;s class scored {HARVARD.sat75} or higher on the SAT, and {fmt(HARVARD.applicants - HARVARD.admitted)} applicants were still turned away.</p>
            <p>When every file has the numbers, the numbers stop deciding. The reader has seen a thousand transcripts like yours. What they haven&apos;t seen is you, and your essays are where you show up. That&apos;s where a file goes from qualified to admitted.</p>
            <p className="text-ink font-medium">It&apos;s also the only part you can still change. Your GPA stopped moving months ago. Your scores are in. Your essays can be rewritten tonight.</p>
          </div>
          <Link href="/essay" className="btn btn-primary btn-lg mt-8">
            Fix my essays <IconArrowRight />
          </Link>
        </div>
        <div className="rounded-[20px] bg-band text-band-ink p-7 sm:p-8 shadow-[var(--shadow-lg)]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            {stats.map((st) => (
              <div key={st.label} className="border-b border-band-line pb-5">
                <div className="text-[40px] font-semibold tracking-[-0.03em] leading-none tnum">{st.value}</div>
                <div className="text-[14px] text-band-ink-3 mt-2">{st.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[15px] leading-[1.6] mt-1">
            Same {FACTORS.gpa} GPA, same {FACTORS.test} SAT: <span className="tnum font-semibold">{FACTORS.odds}%</span> with the essays as written, <span className="tnum font-semibold text-[var(--brand)]">{FACTORS.withFixes}%</span> with them fixed.
          </p>
          <p className="text-[12px] text-band-ink-3 mt-4">Harvard Common Data Set {HARVARD.edition}. Odds are for our sample applicant.</p>
        </div>
      </div>
    </section>
  );
}

function Cta({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
      <Link href="/odds" className="btn btn-primary btn-lg !h-12 !px-6">
        Get my odds <IconArrowRight />
      </Link>
      <Link href="/odds" className="btn btn-secondary btn-lg !h-12 !px-6">
        Upload my Common App
      </Link>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />

      <section className="relative wash-top">
        <div className="dot-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
        <div className="relative wrap pt-12 sm:pt-20 pb-14 sm:pb-16">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14 items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-[var(--soft)] text-[13px] font-medium text-[var(--soft-ink)]">
                  <i className="w-1.5 h-1.5 rounded-full bg-brand" /> Built by Ivy League grads
                </span>
                <span className="inline-flex items-center h-7 px-3 rounded-full bg-[var(--warn-bg)] text-[13px] font-medium text-[var(--warn)] tnum">{daysToRegularDecision()} days to RD deadlines</span>
              </div>
              <h1 className="display text-[44px] sm:text-[60px] mt-6">
                The AI built to get you <em className="italic text-[var(--headline-2)]">in</em>.
              </h1>
              <p className="text-[17px] sm:text-[19px] text-ink-2 leading-[1.55] mt-5 max-w-[560px]">Trained on 500+ essays that got into top schools, EssayOdds scores yours the way an admissions reader would, marks the exact lines holding them back, and shows your real odds at every school on your list from each college&apos;s own data. Fix it all before you submit.</p>
              <Cta className="mt-8" />
              <ul className="list-none p-0 m-0 mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-2">
                {["Two minutes", "Every school on your list", "Cancel anytime"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <IconCheck className="text-brand" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <OddsToy />
          </div>
        </div>
        <div className="relative border-t border-line py-10 bg-ground">
          <div className="wrap">
            <LogoStrip />
          </div>
        </div>
      </section>

      <WhyEssays />

      <section className="border-t border-line bg-subtle">
        <div className="wrap py-20 sm:py-24 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          <div>
            <p className="kicker">The problem</p>
            <h2 className="section-title text-[32px] sm:text-[40px] mt-3">You can&apos;t see your own essay the way a reader does.</h2>
            <div className="flex flex-col gap-4 mt-4 max-w-[520px] text-[16px] text-ink-2 leading-[1.7]">
              <p>You&apos;ve read your draft forty times. Your parents say it&apos;s great. Your counselor has hundreds of other students. Nobody is telling you which lines a reader skims, which sound like every other applicant, and which are the reason they&apos;d remember you.</p>
              <p className="text-ink font-medium">EssayOdds does. It reads your draft like an admissions reader, scores it, and marks the exact lines holding it back. Then it helps you rewrite them in your own voice.</p>
            </div>
            <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-2.5">
              {["Scored on six criteria admissions readers use", "Weak lines marked in your draft, with the fix", "Rewrites from your details, never invented", "Personal statement and every supplement"].map((t) => (
                <li key={t} className="flex gap-2.5 text-[14px]">
                  <IconCheck className="text-brand mt-[3px] shrink-0" /> {t}
                </li>
              ))}
            </ul>
            <Link href="/essay" className="btn btn-primary btn-lg mt-8">
              Score my essay <IconArrowRight />
            </Link>
          </div>
          <div className="stage">
            <EssaySample />
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-20 sm:py-24">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end">
            <div>
              <p className="kicker">Then see what it&apos;s worth</p>
              <h2 className="section-title text-[32px] sm:text-[40px] max-w-[620px] mt-3">Watch your odds move at every school on your list.</h2>
            </div>
            <p className="text-[16px] text-ink-2 leading-[1.65]">No forum guesses. Your odds come from each college&apos;s own admissions data, adjusted for how your essays read, with the one move that raises each number. Fix an essay and watch them climb.</p>
          </div>
          <div className="mt-12">
            <ProductShot />
          </div>
          <div className="mt-10 flex justify-center">
            <Cta className="justify-center" />
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-line bg-subtle scroll-mt-14">
        <div className="wrap py-20 sm:py-24">
          <div className="text-center">
            <p className="text-[14px] font-semibold text-brand tnum">{daysToRegularDecision()} days until most regular-decision deadlines</p>
            <h2 className="section-title text-[32px] sm:text-[40px] mt-3">Every essay, read and fixed, for less than one hour with a counselor.</h2>
            <p className="text-[16px] text-ink-2 mt-3 max-w-[640px] mx-auto">
              Your personal statement, every supplement, your activities and honors, and a Final Read of the whole application. The RD Pass is one payment through January 15, with nothing to cancel.
            </p>
          </div>
          <div className="mt-12">
            <PlanCards />
            <Agree />
            <p className="text-[14px] text-ink-2 text-center mt-5">
              Parent paying?{" "}
              <Link className="underline hover:text-ink" href="/pay">
                Send them this link
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-line scroll-mt-14">
        <div className="wrap py-20 sm:py-24 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
          <div>
            <h2 className="section-title text-[32px] sm:text-[40px]">Before you buy</h2>
            <p className="text-[15px] text-ink-2 leading-[1.6] mt-3">
              Anything else? Write to{" "}
              <a className="text-ink underline" href="mailto:hello@usetrnd.com">
                hello@usetrnd.com
              </a>
              . A person answers.
            </p>
          </div>
          <div className="card divide-y divide-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex items-center justify-between gap-4 text-[15px] font-medium cursor-pointer">
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
          <p className="text-[14px] font-semibold text-brand tnum">{daysToRegularDecision()} days until most regular-decision deadlines</p>
          <h2 className="section-title text-[32px] sm:text-[44px] max-w-[760px] mt-3">Your grades are done. Your essays aren&apos;t.</h2>
          <p className="text-[17px] text-ink-2 leading-[1.6] mt-4 max-w-[560px]">They&apos;re the last part of your application you can still change, and the part readers remember. Make them the reason they say yes.</p>
          <Cta className="mt-8 justify-center" />
        </div>
      </section>

      <footer className="border-t border-line mt-auto">
        <div className="wrap py-8 flex flex-col sm:flex-row gap-4 justify-between sm:items-center text-[13px] text-ink-3">
          <div className="flex items-center gap-4">
            <Brand size={12} />
            <span>© {new Date().getFullYear()} EssayOdds · Built by Ivy League grads</span>
          </div>
          <div className="flex gap-6">
            <Link href="/essays" className="hover:text-ink">
              Essay prompts
            </Link>
            <Link href="/activities" className="hover:text-ink">
              Activities
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
          </div>
        </div>
      </footer>
    </div>
  );
}
