import Link from "next/link";
import { redirect } from "next/navigation";

import ResultEntryForm from "@/components/app/result-entry-form";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

export const metadata = { title: "Results — TRND" };

const fmtMoney = (cents: number | null) =>
  cents === null ? "—" : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
const fmtPct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(2)}%`);

export default async function ResultsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");

  const campaigns = await repo.listCampaigns(business.id);
  const launched = campaigns.filter((c) => c.status === "live" || c.status === "complete");
  const results = await repo.listResultsForBusiness(business.id);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const learnings = await repo.listLearnings(business.category);

  return (
    <div className="wrap" style={{ padding: "44px 32px 72px" }}>
      <span className="eyebrow eyebrow--mint">Measured reality</span>
      <h1 className="h-disp" style={{ fontSize: 28, margin: "0 0 6px" }}>
        What actually happened.
      </h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: 560, lineHeight: 1.6, margin: "0 0 32px" }}>
        Type in what your ad account reports — clicks, spend, bookings, revenue. Every entry
        sharpens next week&apos;s recommendation for your category. Meta API sync drops in later
        without changing this screen.
      </p>

      {launched.filter((c) => c.status === "live").length === 0 && results.length === 0 && (
        <div className="card-lg" style={{ padding: 32 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            Nothing launched yet. Build a campaign from{" "}
            <Link href="/app" style={{ color: "var(--amber)" }}>
              this week&apos;s recommendation
            </Link>
            , mark it launched, and enter its numbers here.
          </p>
        </div>
      )}

      {launched.filter((c) => c.status === "live").length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <h2 className="mono-label" style={{ marginBottom: 14 }}>
            Awaiting results
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {launched
              .filter((c) => c.status === "live")
              .map((c) => (
                <div key={c.id} className="card-lg" style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    <Link href={`/app/campaigns/${c.id}`} style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16 }}>
                      {c.hook}
                    </Link>
                    <span className="mono-label" style={{ color: "var(--mint)" }}>
                      live since {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <ResultEntryForm campaignId={c.id} />
                </div>
              ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section>
          <h2 className="mono-label" style={{ marginBottom: 14 }}>
            History
          </h2>
          <div className="card-lg" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 720 }}>
              <thead>
                <tr>
                  {["Campaign", "Date", "Impressions", "Clicks", "CTR", "Spend", "Cost / result", "Bookings", "Revenue"].map((h) => (
                    <th
                      key={h}
                      className="mono-label"
                      style={{ textAlign: "left", padding: "13px 16px", borderBottom: "1px solid var(--line)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const c = campaignById.get(r.campaign_id);
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", maxWidth: 240 }}>
                        {c ? (
                          <Link href={`/app/campaigns/${c.id}`} style={{ color: "var(--ink)" }}>
                            {c.hook}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>
                        {new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>{fmtNum(r.impressions)}</td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>{fmtNum(r.clicks)}</td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", color: "var(--mint)", fontFamily: "var(--mono)", fontSize: 12.5 }}>
                        {fmtPct(r.ctr === null ? null : Number(r.ctr))}
                      </td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>{fmtMoney(r.spend_cents)}</td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>{fmtMoney(r.cpa_cents)}</td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>{fmtNum(r.bookings)}</td>
                      <td style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>{fmtMoney(r.revenue_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {learnings.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 className="mono-label" style={{ marginBottom: 6 }}>
            What TRND has learned for {business.category}
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-faint)", margin: "0 0 14px" }}>
            Feeds the historical-lift component of every score. Seeded priors are blended out as
            real results come in.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {learnings.map((l) => (
              <span key={l.id} className="pill" title={`${l.sample_size} samples`}>
                {l.angle_type.replace(/_/g, " ")} · lift {Number(l.lift).toFixed(2)} · n={l.sample_size}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
