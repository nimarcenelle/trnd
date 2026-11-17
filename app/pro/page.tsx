import Link from "next/link";
import { notFound } from "next/navigation";

import AppHeader from "@/components/essayodds/app-header";
import CallForm from "@/components/essayodds/call-form";
import { BuyButton } from "@/components/essayodds/plan-cards";
import { IconCheck } from "@/components/icons";
import { isPro, paidAccess } from "@/lib/essayodds/access";
import { currentSession } from "@/lib/essayodds/auth";
import { PLANS, PRO_FEATURES } from "@/lib/essayodds/plans";
import { env, isEssayOpen } from "@/lib/env";

export const metadata = { title: "Pro · EssayOdds" };

/** Pro buyers' home for the extras: book the call, the SAT plan, the reach/target/likely list. Everyone else sees Pro. */
export default async function ProPage() {
  if (!isEssayOpen) notFound();
  const [access, account] = await Promise.all([paidAccess(), currentSession()]);
  const pro = isPro(access);
  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader />
      <main className="flex-1 bg-subtle">
        <div className="wrap py-12 sm:py-16 max-w-[880px]">
          <p className="kicker">Pro</p>
          <h1 className="section-title text-[32px] sm:text-[40px] mt-2">{pro ? "Your Pro extras" : "A person in your corner, before you submit."}</h1>
          {pro ? (
            <div className="mt-8 flex flex-col gap-4">
              <section className="card p-6 sm:p-8">
                <h2 className="text-[18px] font-semibold">Book your 1:1 call</h2>
                <p className="text-[14px] text-ink-2 mt-1 leading-[1.6]">45 minutes with an Ivy League grad on whatever matters most: your list, your essays, your activities.</p>
                <div className="mt-6">
                  {env.proBookingUrl ? (
                    <a className="btn btn-primary btn-lg" href={env.proBookingUrl} target="_blank" rel="noopener noreferrer">
                      Pick a time
                    </a>
                  ) : (
                    <CallForm email={account?.email ?? access?.email ?? ""} />
                  )}
                </div>
              </section>
              <div className="grid gap-4 sm:grid-cols-2">
                <Link href="/sat" className="card p-6 hover:border-line-strong transition-colors">
                  <h2 className="text-[16px] font-semibold">Your SAT plan</h2>
                  <p className="text-[14px] text-ink-2 mt-1 leading-[1.6]">Upload a scored practice test. Get the skills costing you points and what to drill first.</p>
                </Link>
                <Link href="/odds" className="card p-6 hover:border-line-strong transition-colors">
                  <h2 className="text-[16px] font-semibold">Reach, target, likely</h2>
                  <p className="text-[14px] text-ink-2 mt-1 leading-[1.6]">Run your odds and every school on your list is sorted, so you know where you stand.</p>
                </Link>
              </div>
            </div>
          ) : (
            <div className="card p-6 sm:p-8 mt-8 max-w-[480px]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[40px] font-semibold tnum">{PLANS.pro.price}</span>
                <span className="text-[14px] text-ink-3">{PLANS.pro.per}</span>
              </div>
              <p className="text-[13px] text-ink-2 mt-1">{PLANS.pro.billed}</p>
              <ul className="list-none p-0 m-0 mt-6 mb-8 flex flex-col gap-3">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[14px]">
                    <IconCheck className="text-brand mt-[3px] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <BuyButton plan={PLANS.pro} primary label={access?.plan === "rd" ? `Upgrade to Pro for $${(PLANS.pro.cents - PLANS.rd.cents) / 100}` : undefined} />
              {access?.plan === "rd" && <p className="caption mt-3">You have the RD Pass, so you pay only the difference. Pro adds the call, the school sorting and the SAT plan.</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
