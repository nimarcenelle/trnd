import { notFound } from "next/navigation";

import { Agree } from "@/components/admitted/plan-cards";
import PlanCards from "@/components/admitted/plan-cards";
import SiteNav from "@/components/site-nav";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "Pay for a student · EssayOdds", description: "Pay for a student's EssayOdds essays. After checkout you get one link to send them." };

/** The page a student sends whoever is paying. No account on either side: the payer gets a link to pass on. */
export default function PayPage() {
  if (!isEssayOpen) notFound();
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="flex-1 wash-top">
        <div className="wrap py-16 sm:py-24">
          <div className="text-center max-w-[640px] mx-auto">
            <p className="kicker">Paying for a student</p>
            <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Pay here, send them one link.</h1>
            <p className="text-[16px] text-ink-2 leading-[1.65] mt-4">Pick a plan and check out. Next you get an access link to send your student. They open it and their essays are unlocked. Neither of you needs an account.</p>
          </div>
          <div className="mt-12">
            <PlanCards forStudent />
            <Agree />
          </div>
        </div>
      </main>
    </div>
  );
}
