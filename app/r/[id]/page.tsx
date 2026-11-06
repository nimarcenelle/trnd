import { notFound } from "next/navigation";

import { FullReport } from "@/components/creator/check";
import Teaser from "@/components/creator/teaser";
import SiteNav from "@/components/site-nav";
import { hasActivePlan } from "@/lib/creator/access";
import { getCheck, logEvent } from "@/lib/creator/store";

export const metadata = { title: "Your report — TRND", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A creator's report, at the private link the onboarding made. Paid (this
 * check, or a live creator plan in this browser): the whole thing. Not yet:
 * the teaser and the paywall.
 */
export default async function ReportPage({ params, searchParams }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const q = await searchParams;
  const c = await getCheck(id);
  if (!c || !c.stats || q.k !== c.token) notFound();
  const unlocked = c.paid || (await hasActivePlan());
  if (!unlocked) await logEvent("paywall_view", { handle: c.handle, platform: c.platform, meta: { id } });

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <main className="wrap pt-8 sm:pt-12 pb-20 w-full">
        {unlocked ? (
          <>
            {q.welcome && (
              <div className="well px-4 py-3 mb-8 text-[14px]">
                You&apos;re in. Here&apos;s everything. We&apos;ll re-check @{c.handle} every week and email you what changed.
              </div>
            )}
            <FullReport r={c} />
          </>
        ) : (
          <Teaser c={c} billingOff={q.billing === "off"} unpaid={q.unpaid === "1"} />
        )}
      </main>
    </div>
  );
}
