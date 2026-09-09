import { redirect } from "next/navigation";
import { after } from "next/server";

import AskPanel from "@/components/app/ask-panel";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import { getAdminRepo } from "@/lib/db/admin";
import { ensureIntelFresh } from "@/lib/intel/ingest";

export const metadata = { title: "Ask — TRND" };

/**
 * Ask-TRND: one question, one cited answer over everything TRND holds for
 * this business — signals, ranking, reviews, competitors, results. Answers
 * admit gaps instead of guessing.
 */
export default async function AskPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  // If this business's listing was never resolved, pull its intel now so
  // the next question has reviews and ratings to reason over.
  after(async () => {
    try {
      await ensureIntelFresh(getAdminRepo(), business);
    } catch (err) {
      console.warn("[ask] intel self-heal failed (non-fatal):", (err as Error).message);
    }
  });

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>Ask TRND</span>
          <h1>Ask your analyst anything.</h1>
          <p className="context">
            Answers come only from {business.name}&apos;s own data — signals, ranking, reviews,
            competitor reads, results — with the sources shown. Where the data can&apos;t answer,
            it says so.
          </p>
        </div>
      </div>
      <AskPanel />
    </div>
  );
}
