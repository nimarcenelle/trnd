import { notFound } from "next/navigation";

import SiteNav from "@/components/site-nav";
import { getSessionUser } from "@/lib/auth/session";
import { allRows } from "@/lib/db/rows";
import { adminSupabase } from "@/lib/db/supabase";
import { env } from "@/lib/env";
import { isoDaysAgo } from "@/lib/format";
import { type CreatorRow, type EventRow, metrics, type Rate } from "@/lib/metrics";

export const metadata = { title: "Funnel — TRND for creators", robots: { index: false } };
export const dynamic = "force-dynamic";

const pct = (r: Rate) => (r.rate === null ? "—" : `${(r.rate * 100).toFixed(r.rate < 0.1 ? 1 : 0)}%`);

function Kpi({ label, r, note }: { label: string; r: Rate; note: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="label">{label}</div>
      <div className="stat-num my-1 tnum">{pct(r)}</div>
      <div className="caption">
        {r.n} of {r.of} · {note}
      </div>
    </div>
  );
}

/** The brief's metrics, for the emails in ADMIN_EMAILS. Last 30 days unless a metric says otherwise. */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user || !env.adminEmails.includes(user.email.toLowerCase())) notFound();
  const sb = adminSupabase();
  const since = isoDaysAgo(120);
  const [events, creators, runs] = await Promise.all([
    allRows<EventRow>((from, to) => sb.from("events").select("kind, creator_id, meta, created_at").gte("created_at", since).order("id").range(from, to), 100_000),
    allRows<CreatorRow>((from, to) => sb.from("creators").select("id, plan, plan_status, created_at").order("id").range(from, to)),
    allRows<{ creator_id: string }>((from, to) => sb.from("idea_runs").select("creator_id").eq("status", "checked").order("id").range(from, to)),
  ]);
  const m = metrics(events, creators, { checked: new Set(runs.map((r) => r.creator_id)) });
  const paying = m.mix.month + m.mix.year + m.mix.legacy;

  return (
    <div>
      <SiteNav links={false} />
      <main className="wrap py-10 grid gap-10">
        <section className="grid gap-3">
          <h1 className="display text-[28px]">Funnel</h1>
          <p className="text-ink-2 m-0">Last 30 days, from the event log. Retention reads accounts up to 120 days old.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Free handle → account" r={m.handleToAccount} note="accounts per handle previewed" />
            <Kpi label="Account → first plan viewed" r={m.accountToPlan} note="new accounts that opened a plan" />
            <Kpi label="First plan → paid" r={m.planToPaid} note={Object.entries(m.paidByTier).map(([t, n]) => `${t} ${n}`).join(" · ") || "no payments yet"} />
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="heading text-[18px]">Retention</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Week-2 plan opens" r={m.week2} note="accounts 14+ days old, opened in days 7–13" />
            <Kpi label="Week-4 plan opens" r={m.week4} note="accounts 28+ days old, opened in days 21–27" />
            <Kpi label="Scorecard opens" r={m.scorecard} note="accounts with a checked idea" />
            <Kpi label="Share cards" r={m.share} note="saved per handle previewed" />
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="heading text-[18px]">Billing</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card px-4 py-3.5">
              <div className="label">Yearly</div>
              <div className="stat-num my-1 tnum">{m.mix.year}</div>
              <div className="caption">{paying ? `${Math.round((m.mix.year / paying) * 100)}% of paying accounts` : "no paying accounts"}</div>
            </div>
            <div className="card px-4 py-3.5">
              <div className="label">Monthly</div>
              <div className="stat-num my-1 tnum">{m.mix.month}</div>
              <div className="caption">on $19/month</div>
            </div>
            <div className="card px-4 py-3.5">
              <div className="label">Old prices</div>
              <div className="stat-num my-1 tnum">{m.mix.legacy}</div>
              <div className="caption">still on $9.99/week or $24.99/month</div>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="text-left">Churn by plan</th>
                  <th className="text-right">Canceled</th>
                  <th className="text-right">Of</th>
                  <th className="text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(m.churn).map(([plan, r]) => (
                  <tr key={plan}>
                    <td className="mono">{plan}</td>
                    <td className="text-right tnum">{r.n}</td>
                    <td className="text-right tnum">{r.of}</td>
                    <td className="text-right tnum">{pct(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
