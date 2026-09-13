import Link from "next/link";
import { redirect } from "next/navigation";

import StatusTimeline from "@/components/app/status-timeline";
import ListRuns from "@/components/picks/list-runs";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { Campaign } from "@/lib/db/types";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Campaigns — TRND" };

const ORDER: Campaign["status"][] = ["live", "draft", "exported", "complete"];
const GROUP_LABEL: Record<Campaign["status"], string> = {
  live: "Live — waiting on results",
  draft: "Drafts — ready to launch",
  exported: "Exported",
  complete: "Complete",
};

export default async function CampaignsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const [campaigns, pickRuns] = await Promise.all([
    repo.listCampaigns(business.id),
    // A pick someone said they are running belongs here beside the campaigns.
    repo.listPickRuns(business.id),
  ]);
  const signalTermByCampaign = new Map<string, string | null>(
    await Promise.all(
      campaigns.map(async (c) => {
        const opp = await repo.getOpportunity(c.opportunity_id);
        const signal = opp ? await repo.getSignal(opp.signal_id) : null;
        return [c.id, signal?.term ?? null] as const;
      }),
    ),
  );

  const groups = ORDER.map((status) => ({
    status,
    items: campaigns.filter((c) => c.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <p className="context">
            Drafts are ready to launch. Live campaigns are waiting on results.
          </p>
        </div>
        <div className="flex gap-[10px] items-center flex-wrap">
          <span className="badge"><i />{campaigns.length} total</span>
          <Link href="/app/results" className="btn btn-ghost btn-sm">
            All results
          </Link>
        </div>
      </div>

      <ListRuns runs={pickRuns} />

      {campaigns.length === 0 && pickRuns.length === 0 && (
        <div className="panel max-w-[620px]">
          <p className="mx-0 mt-0 mb-4 text-ink-soft text-[14.5px] leading-[1.6]">
            Nothing running yet. When you run one of this week&apos;s picks, it shows up here.
          </p>
          <Link href="/app/picks" className="btn btn-primary btn-sm">
            See this week&apos;s picks
          </Link>
        </div>
      )}

      {groups.map((g) => (
        <section className="mb-[26px]" key={g.status}>
          <div className="panel__head mb-3">
            <span className={`panel__title${g.status === "live" || g.status === "complete" ? " mint" : ""}`}>
              {GROUP_LABEL[g.status]}
            </span>
            <span className="panel__meta">{g.items.length}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,_minmax(320px,_1fr))] gap-[14px]">
            {g.items.map((c) => {
              const term = signalTermByCampaign.get(c.id);
              return (
                <Link key={c.id} href={`/app/campaigns/${c.id}`} className="panel block py-5 px-[22px]">
                  {term && (
                    <span className="mono-label text-(--amber-text) block mb-2">
                      {sentenceCase(term)}
                    </span>
                  )}
                  <p className="font-disp font-semibold text-[15.5px] mx-0 mt-0 mb-[14px] leading-[1.35]">
                    {c.hook}
                  </p>
                  <StatusTimeline status={c.status} compact />
                  <p className="text-[12px] text-ink-faint mx-0 mt-[14px] mb-0">
                    {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {c.channel} ·{" "}
                    {c.status === "draft" ? "launch today" : c.status === "live" ? "enter results when ready" : "done"}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
