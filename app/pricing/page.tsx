import Link from "next/link";

import PlanCards, { Agree } from "@/components/admitted/plan-cards";
import { IconCheck } from "@/components/icons";
import SiteNav from "@/components/site-nav";
import { PLANS } from "@/lib/admitted/plans";

export const metadata = { title: "Pricing · Admitted", description: "Odds and your first essay review are free. Unlimited reviews and rewrites: $29 a month or $99 for six months." };

const ROWS: { label: string; free: string | boolean; paid: string | boolean }[] = [
  { label: "Odds at every school, with sources", free: true, paid: true },
  { label: "Essay prompts for every school we cover", free: true, paid: true },
  { label: "Activity and honors list reviews", free: true, paid: true },
  { label: "Essay reviews: score, marked lines, fixes", free: "One", paid: "Unlimited" },
  { label: "Rewrites in your voice", free: false, paid: true },
  { label: "Revisions re-scored", free: false, paid: true },
  { label: "Final Read before you submit", free: false, paid: true },
];

const FAQ = [
  { q: "What is the difference between monthly and the season pass?", a: `Nothing but billing. Monthly is ${PLANS.monthly.price} a month. The season pass is ${PLANS.season.price} for six months, ${PLANS.season.monthly}, which covers a full application season.` },
  { q: "Do I need a card for the free review?", a: "No card and no account. Paste a draft and get the full review: the score, the lines costing you most and what to do about each." },
  { q: "Can a parent pay?", a: "Yes. Send them admitted.usetrnd.com/pay. After checkout they get one link to send you, and opening it unlocks your essays." },
  { q: "Can I cancel?", a: "Anytime, from Account on the essay page. You keep access until the end of the period you paid for." },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <IconCheck className="text-brand mx-auto" aria-label="Included" />;
  if (value === false) return <span className="text-ink-3" aria-label="Not included">–</span>;
  return <span className="text-[13px] font-medium">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="flex-1">
        <section className="wash-top">
          <div className="wrap py-16 sm:py-24">
            <div className="text-center max-w-[680px] mx-auto">
              <p className="kicker">Pricing</p>
              <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Your first essay review is free.</h1>
              <p className="text-[16px] text-ink-2 leading-[1.65] mt-4">Odds, prompts, activity reviews and one full essay review cost nothing and need no card. Pay when you want every draft reviewed and rewritten.</p>
            </div>
            <div className="mt-12">
              <PlanCards />
              <Agree />
              <p className="text-[14px] text-ink-2 text-center mt-6">
                Someone else paying?{" "}
                <Link className="underline hover:text-ink" href="/pay">
                  Send them this page
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="wrap py-16 sm:py-24 max-w-[880px]">
            <h2 className="section-title text-[32px]">Compare plans</h2>
            <div className="card mt-8 overflow-x-auto">
              <table className="w-full text-[14px] border-collapse">
                <thead>
                  <tr className="bg-subtle text-ink-2 text-[13px]">
                    <th className="text-left font-medium px-5 py-3">Feature</th>
                    <th className="font-medium px-5 py-3 w-[110px]">Free</th>
                    <th className="font-medium px-5 py-3 w-[150px]">Monthly or season</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.label} className="border-t border-line">
                      <td className="px-5 py-3">{r.label}</td>
                      <td className="px-5 py-3 text-center">
                        <Cell value={r.free} />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Cell value={r.paid} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
