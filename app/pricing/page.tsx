import Link from "next/link";

import PlanCards, { Agree } from "@/components/admitted/plan-cards";
import SiteNav from "@/components/site-nav";
import { daysToRegularDecision } from "@/lib/admitted/deadline";
import { PLANS } from "@/lib/admitted/plans";

export const metadata = { title: "Pricing · Admitted", description: "Essay scores, marked lines and rewrites in your voice for every essay you submit: $99 for the season or $29 a month." };

/** The deadline countdown is worked out on the server, so the page rebuilds hourly. */
export const revalidate = 3600;

const FAQ = [
  { q: "What's the difference between the season pass and monthly?", a: `Only billing. The season pass is ${PLANS.season.price} for six months (${PLANS.season.monthly}) and covers every deadline this cycle. Monthly is ${PLANS.monthly.price} a month.` },
  { q: "What do I get?", a: "Your essay scored out of 100 with every weak line marked and the fix, rewrites in your voice from your own details, every supplement and revision re-scored, your activity and honors lists tightened, and a Final Read of everything before you submit." },
  { q: "Can a parent pay?", a: "Yes. Send them admitted.usetrnd.com/pay. After checkout they get one link to send you, and opening it unlocks everything." },
  { q: "Can I cancel?", a: "Anytime, from Account on the essay page. You keep access until the end of the period you paid for." },
];

export default function PricingPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="flex-1">
        <section className="wash-top">
          <div className="wrap py-16 sm:py-24">
            <div className="text-center max-w-[680px] mx-auto">
              <p className="text-[14px] font-semibold text-brand tnum">{daysToRegularDecision()} days until most regular-decision deadlines</p>
              <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Every essay you submit, scored and fixed.</h1>
              <p className="text-[16px] text-ink-2 leading-[1.65] mt-4">One plan covers your personal statement, every supplement, your activity list and a Final Read before you hit submit.</p>
            </div>
            <div className="mt-12">
              <PlanCards />
              <Agree />
              <p className="text-[14px] text-ink-2 text-center mt-6">
                Parent paying?{" "}
                <Link className="underline hover:text-ink" href="/pay">
                  Send them this page
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-subtle">
          <div className="wrap py-16 sm:py-24 max-w-[880px]">
            <h2 className="section-title text-[32px]">Pricing questions</h2>
            <div className="card divide-y divide-line mt-8">
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
      </main>
    </div>
  );
}
