import Link from "next/link";
import { redirect } from "next/navigation";

import StatusTimeline from "@/components/app/status-timeline";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import type { Campaign } from "@/lib/db/types";
import { titleCase } from "@/lib/text";

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

  const campaigns = await repo.listCampaigns(business.id);
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
          <span className="eyebrow" style={{ margin: 0 }}>Campaigns</span>
          <h1>Everything TRND has built for you.</h1>
          <p className="context">
            Drafts are ready to launch today; live ones sharpen next week once you record results.
          </p>
        </div>
        <span className="badge"><i />{campaigns.length} total</span>
      </div>

      {campaigns.length === 0 && (
        <div className="panel" style={{ maxWidth: 620 }}>
          <p style={{ margin: "0 0 16px", color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6 }}>
            No campaigns yet. Your first one is a single click from this week&apos;s
            recommendation — finished copy, scripts, and targeting included.
          </p>
          <Link href="/app" className="btn btn-primary btn-sm">
            See this week&apos;s recommendation →
          </Link>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.status} style={{ marginBottom: 26 }}>
          <div className="panel__head" style={{ marginBottom: 12 }}>
            <span className={`panel__title${g.status === "live" || g.status === "complete" ? " mint" : ""}`}>
              {GROUP_LABEL[g.status]}
            </span>
            <span className="panel__meta">{g.items.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
            {g.items.map((c) => {
              const term = signalTermByCampaign.get(c.id);
              return (
                <Link key={c.id} href={`/app/campaigns/${c.id}`} className="panel" style={{ display: "block", padding: "20px 22px" }}>
                  {term && (
                    <span className="mono-label" style={{ color: "var(--amber-text)", display: "block", marginBottom: 8 }}>
                      {titleCase(term)}
                    </span>
                  )}
                  <p style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 15.5, margin: "0 0 14px", lineHeight: 1.35 }}>
                    {c.hook}
                  </p>
                  <StatusTimeline status={c.status} />
                  <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "14px 0 0" }}>
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
