import "./campaigns.css";

import Link from "next/link";
import { redirect } from "next/navigation";

import ListRuns from "@/components/picks/list-runs";
import { getSessionUser } from "@/lib/auth/session";
import { GROUP_LABEL, STATUS_ORDER, statusChip } from "@/lib/campaigns/view";
import { getUserRepo } from "@/lib/db";
import { shortDate } from "@/lib/picks/list";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Campaigns — TRND" };

/**
 * Every campaign, grouped by what it needs next. Each card is the term, the
 * headline under it, its status, and when it was built; the runs from this
 * week's picks sit above the groups.
 */
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

  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: campaigns.filter((c) => c.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Built from your picks</span>
          <h1>Campaigns</h1>
          <p className="context">Drafts are ready to launch; live ones are waiting on results.</p>
        </div>
        {campaigns.length > 0 && (
          <Link href="/app/results" className="btn btn-ghost btn-sm">
            All results
          </Link>
        )}
      </div>

      <ListRuns runs={pickRuns} />

      {campaigns.length === 0 && pickRuns.length === 0 && (
        <div className="panel camps__empty">
          <p>Nothing running yet. A pick you run shows up here.</p>
          <Link href="/app/picks" className="btn btn-primary btn-sm">
            This week&apos;s picks
          </Link>
        </div>
      )}

      {groups.map((g) => (
        <section className="camps__group" key={g.status} aria-labelledby={`camps-${g.status}`}>
          <div className="camps__group-head">
            <span id={`camps-${g.status}`} className="eyebrow m-0">
              {GROUP_LABEL[g.status]}
            </span>
            <span className="camps__count">{g.items.length}</span>
          </div>
          <div className="camps__grid">
            {g.items.map((c) => {
              const term = signalTermByCampaign.get(c.id);
              const chip = statusChip(c.status);
              return (
                <Link key={c.id} href={`/app/campaigns/${c.id}`} className="camps__card">
                  <span className="camps__head">
                    <span className="camps__term">{sentenceCase(term ?? c.hook)}</span>
                    {term && <span className="camps__headline">{sentenceCase(c.hook)}</span>}
                  </span>
                  <span className="camps__foot">
                    <span className={`badge${chip.tone ? ` badge--${chip.tone}` : ""}`}>
                      <i />
                      {chip.label}
                    </span>
                    {/* A campaign row carries no budget or duration of its own; the date stands alone. */}
                    <span className="camps__meta">{shortDate(c.created_at)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
