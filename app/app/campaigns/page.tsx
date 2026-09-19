import Link from "next/link";
import { redirect } from "next/navigation";

import ListRuns from "@/components/picks/list-runs";
import { readAdHistory } from "@/lib/ads/history-read";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { benchmarkFor } from "@/lib/results/benchmarks";

export const metadata = { title: "Campaigns — TRND" };

/**
 * Every creative test the brand chose, newest first, in the order it moved:
 * chosen is not launched, launched is not successful, and no result is not
 * a loss. A launched test takes its results here, or gets them from the
 * account history by the name the brief gave it.
 */
export default async function CampaignsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");

  const [pickRuns, history] = await Promise.all([
    repo.listPickRuns(business.id),
    // Its outcome is judged against the brand's own account first.
    repo.listAdHistory(business.id).catch(() => []),
  ]);
  const outcomes = { accountCtr: readAdHistory(history).accountCtr, benchmarkCtr: benchmarkFor(business.category) };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Tests in progress</span>
          <h1>Campaigns</h1>
          <p className="context">
            Every test you chose, in the order it moved: chosen is not launched, launched is not successful, and no result
            is not a loss.
          </p>
        </div>
        {pickRuns.length > 0 && (
          <Link href="/app/record" className="btn btn-ghost btn-sm">
            Track record
          </Link>
        )}
      </div>

      <ListRuns runs={pickRuns} outcomes={outcomes} history={history} />

      {pickRuns.length === 0 && (
        <div className="panel max-w-[620px]">
          <p className="m-0 mb-4 text-[14.5px] leading-[1.6] text-ink-soft">Nothing in production yet. A concept you choose shows up here.</p>
          <Link href="/app/picks" className="btn btn-primary btn-sm">
            This week&apos;s tests
          </Link>
        </div>
      )}
    </div>
  );
}
