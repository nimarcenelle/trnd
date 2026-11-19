import Link from "next/link";
import { notFound } from "next/navigation";

import AppHeader from "@/components/essayodds/app-header";
import { BuyButton } from "@/components/essayodds/plan-cards";
import SatPlanner from "@/components/essayodds/sat-planner";
import { isPro, paidAccess } from "@/lib/essayodds/access";
import { PLANS } from "@/lib/essayodds/plans";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "SAT plan · EssayOdds", description: "Upload a scored SAT practice test. See the skills costing you the most points and get a three-week plan." };

export default async function SatPage() {
  if (!isEssayOpen) notFound();
  const access = await paidAccess();
  const pro = isPro(access) && access?.id !== "demo";
  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader />
      <main className="flex-1 bg-subtle">
        <div className="wrap py-12 sm:py-16">
          <p className="kicker">SAT plan · Pro</p>
          <h1 className="section-title text-[32px] sm:text-[40px] mt-2 max-w-[760px]">Find the points you&apos;re leaving on the SAT.</h1>
          <p className="text-[16px] text-ink-2 leading-[1.65] mt-3 max-w-[640px]">Upload a scored practice test. We read every question you missed, sort them by skill, and tell you what to fix first, the way a tutor would.</p>
          <div className="mt-10">
            {pro ? (
              <SatPlanner />
            ) : (
              <div className="card p-6 max-w-[480px]">
                <p className="text-[15px] font-semibold">The SAT plan comes with Pro</p>
                <p className="text-[13px] text-ink-2 mt-1 leading-[1.55]">
                  {PLANS.pro.short}: everything in the RD Pass, a 1:1 call, your list sorted into reach, target and likely, and this SAT plan.
                </p>
                <div className="mt-4 max-w-[260px]">
                  <BuyButton plan={PLANS.pro} primary agree label={access?.plan === "rd" ? `Upgrade to Pro for $${(PLANS.pro.cents - PLANS.rd.cents) / 100}` : undefined} />
                </div>
                <Link className="text-[13px] underline text-ink-2 hover:text-ink inline-block mt-3" href="/pro">
                  What&apos;s in Pro
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
