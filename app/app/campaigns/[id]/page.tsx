import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdPreview from "@/components/app/ad-preview";
import CopyAllButton from "@/components/app/copy-all-button";
import CopyBlock from "@/components/app/copy-block";
import LaunchToMetaButton from "@/components/app/launch-to-meta-button";
import ResultEntryForm from "@/components/app/result-entry-form";
import StatusTimeline from "@/components/app/status-timeline";
import { getSessionUser } from "@/lib/auth/session";
import { markLaunchedAction } from "@/lib/campaigns/actions";
import { tiktokHashtag, trendLinks } from "@/lib/recommend/howto";
import { forecastFlight, forecastLine } from "@/lib/recommend/forecast";
import { budgetFor } from "@/lib/recommend/insights";
import { titleCase } from "@/lib/text";
import { getUserRepo } from "@/lib/db";
import type { Creative } from "@/lib/db/types";

export const metadata = { title: "Campaign — TRND" };

const KIND_LABELS: Record<Creative["kind"], string> = {
  headline: "Headline",
  primary_text: "Primary text",
  script: "Video script",
  static_brief: "Static brief",
  landing_copy: "Landing copy",
};

export default async function CampaignPage({ params }: PageProps<"/app/campaigns/[id]">) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const campaign = await repo.getCampaign(id);
  if (!campaign) notFound();
  const [creatives, opportunity, business, metaConnection] = await Promise.all([
    repo.listCreatives(id),
    repo.getOpportunity(campaign.opportunity_id),
    repo.getBusiness(campaign.business_id),
    repo.getConnection(campaign.business_id, "meta"),
  ]);
  const metaReady = metaConnection?.status === "connected" && Boolean(metaConnection.account_id);
  const campaignResults = (await repo.listResultsForBusiness(campaign.business_id)).filter(
    (r) => r.campaign_id === campaign.id,
  );
  const signal = opportunity ? await repo.getSignal(opportunity.signal_id) : null;

  const byKind = (kind: Creative["kind"]) => creatives.filter((c) => c.kind === kind);
  const headlines = byKind("headline");
  const primaries = byKind("primary_text");
  const budget = budgetFor(business?.price_band ?? null);

  const copyAll = [
    `ANGLE\n${campaign.angle}`,
    `HOOK\n${campaign.hook}`,
    `OFFER\n${campaign.offer}`,
    `AUDIENCE\n${campaign.audience.who} · ${campaign.audience.age_range} · ${campaign.audience.radius_miles}mi\nWhy: ${campaign.audience.why}`,
    ...(["headline", "primary_text", "script", "static_brief", "landing_copy"] as const).map(
      (kind) =>
        `${KIND_LABELS[kind].toUpperCase()}S\n` +
        byKind(kind)
          .map((c, i) => `${i + 1}. ${c.content}`)
          .join("\n\n"),
    ),
  ].join("\n\n———\n\n");

  const launched = campaign.status === "live" || campaign.status === "complete";

  return (
    <div className="page">
      <Link href="/app" className="mono-label" style={{ display: "inline-block", marginBottom: 16 }}>
        Back to this week
      </Link>

      {/* ---------- HEADER ---------- */}
      <header className="panel panel--hero" style={{ padding: "30px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ maxWidth: 620 }}>
            <h1 className="h-disp" style={{ fontSize: "clamp(24px,3vw,34px)", margin: "0 0 12px", lineHeight: 1.12 }}>
              {campaign.hook}
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--ink-soft)", margin: 0 }}>{campaign.angle}</p>
          </div>
          <StatusTimeline status={campaign.status} />
        </div>

        <div className="facts-grid" style={{ marginTop: 24, paddingTop: 20, borderTop: "1px dashed var(--line)" }}>
          <div>
            <span className="k" style={{ color: "var(--amber-text)" }}>Offer</span>
            <p className="v" style={{ fontWeight: 600, fontFamily: "var(--disp)" }}>{campaign.offer}</p>
          </div>
          <div>
            <span className="k">Audience</span>
            <p className="v" style={{ fontSize: 13.5 }}>
              {campaign.audience.who} · {campaign.audience.age_range} · {campaign.audience.radius_miles} mi
            </p>
          </div>
          <div>
            <span className="k">Source signal</span>
            <p className="v" style={{ fontSize: 13.5 }}>{signal ? `"${titleCase(signal.term)}"` : "—"}</p>
          </div>
          <div>
            <span className="k">Built</span>
            <p className="v" style={{ fontSize: 13.5 }}>
              {new Date(campaign.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
        </div>

      </header>

      {/* ---------- STEP 1 · SHOOT ---------- */}
      <section className="step-card">
        <div className="step-head">
          <span className="step-num">1</span>
          <h3>Creative</h3>
        </div>
        <p className="lede">
          Three shot directions. Each can be taken on a phone.
        </p>
        <div className="creative-grid">
          {byKind("static_brief").map((c, i) => {
            const photo = (business?.photo_urls ?? [])[i];
            return (
              <div key={c.id} className="creative-card">
                <div
                  className={`art art--${(i % 3) + 1}`}
                  style={
                    photo
                      ? {
                          backgroundImage: `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.45)), url(${JSON.stringify(photo)})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          color: "#fff",
                        }
                      : undefined
                  }
                  title={photo ? "One of your own site photos — a starting point for this shot" : undefined}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="cap">
                  <span className="tag">Direction {i + 1}</span>
                  <span className="desc">{c.content}</span>
                </div>
              </div>
            );
          })}
        </div>

        <details className="section-disclosure" style={{ marginTop: 18 }}>
          <summary>
            <span className="panel__title">Video scripts</span>
            <span className="summary-right">
              <span className="panel__meta">{byKind("script").length} scripts · 20–30s each</span>
              <span className="summary-open-hint">open ↓</span>
            </span>
          </summary>
          <div className="section-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
              {byKind("script").map((c) => (
                <CopyBlock key={c.id} label={`Script ${c.variant_index + 1}`} content={c.content} mono />
              ))}
            </div>
          </div>
        </details>
      </section>

      {/* ---------- STEP 2 · WRITE ---------- */}
      <section className="step-card">
        <div className="step-head">
          <span className="step-num">2</span>
          <h3>Copy</h3>
        </div>
        <p className="lede">
          Five headlines and three primary texts.
        </p>
        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 18, alignItems: "start" }}>
          <div>
            <div className="panel__head" style={{ marginBottom: 10 }}>
              <span className="panel__title">Headlines</span>
              <span className="panel__meta">{headlines.length} variants</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 20 }}>
              {headlines.map((c) => (
                <CopyBlock key={c.id} label={`Headline ${c.variant_index + 1}`} content={c.content} />
              ))}
            </div>
            <div className="panel__head" style={{ marginBottom: 10 }}>
              <span className="panel__title">Primary texts</span>
              <span className="panel__meta">{primaries.length} variants</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              {primaries.map((c) => (
                <CopyBlock key={c.id} label={`Primary text ${c.variant_index + 1}`} content={c.content} />
              ))}
            </div>
          </div>
          <div>
            <div className="panel__head" style={{ marginBottom: 10 }}>
              <span className="panel__title">In-feed preview</span>
            </div>
            <AdPreview
              businessName={business?.name ?? "Your business"}
              primaryText={primaries[0]?.content ?? campaign.angle}
              headline={headlines[0]?.content ?? campaign.hook}
              mediaLine={campaign.offer}
              imageUrl={(business?.photo_urls ?? [])[0] ?? null}
            />
          </div>
        </div>

        {signal && (
          <div className="ref-links">
            <a className="ref-link" href={trendLinks(signal.term, { hashtag: tiktokHashtag(signal) }).tiktok} target="_blank" rel="noopener noreferrer">
              See what&apos;s working on TikTok
            </a>
            <a className="ref-link" href={trendLinks(signal.term, { hashtag: tiktokHashtag(signal) }).instagram} target="_blank" rel="noopener noreferrer">
              See what&apos;s working on Instagram
            </a>
          </div>
        )}

        <details className="section-disclosure" style={{ marginTop: 18 }}>
          <summary>
            <span className="panel__title">Landing copy</span>
            <span className="summary-right">
              <span className="panel__meta">For the landing page</span>
              <span className="summary-open-hint">open ↓</span>
            </span>
          </summary>
          <div className="section-body">
            <div style={{ maxWidth: 720 }}>
              {byKind("landing_copy").map((c) => (
                <CopyBlock key={c.id} label="Landing section" content={c.content} />
              ))}
            </div>
          </div>
        </details>
      </section>

      {/* ---------- STEP 3 · TARGET ---------- */}
      <section className="step-card">
        <div className="step-head">
          <span className="step-num">3</span>
          <h3>Targeting and budget</h3>
        </div>
        <p className="lede">A starting point sized to your price band.</p>
        <div className="target-grid">
          <div className="t-box">
            <span className="k">Suggested budget</span>
            <div className="v">{budget.daily} / day</div>
          </div>
          <div className="t-box" style={{ gridColumn: "1 / -1" }}>
            <span className="k">What a 6-day test should return</span>
            <div className="v" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              {forecastLine(forecastFlight({ daily: budget.daily, category: business?.category ?? "" }))}
            </div>
          </div>
          <div className="t-box">
            <span className="k">Radius</span>
            <div className="v">{campaign.audience.radius_miles} miles from you</div>
          </div>
          <div className="t-box">
            <span className="k">Audience</span>
            <div className="v">
              {campaign.audience.who} · {campaign.audience.age_range}
            </div>
          </div>
        </div>
        <div className="flight" style={{ marginTop: 18 }}>
          <div className="flight__step">
            <span className="flight__when">Days 1–3</span>
            <p className="flight__what">
              <b>Headline 1 vs headline 2</b>, both on primary text 1, even spend.
            </p>
          </div>
          <div className="flight__step">
            <span className="flight__when">Days 4–6</span>
            <p className="flight__what">
              <b>Keep the winner</b>, swap in primary text 2 against it.
            </p>
          </div>
          <div className="flight__step">
            <span className="flight__when">Kill rule</span>
            <p className="flight__what">
              Pause anything under <b>half your median CTR</b> after 1,000 impressions.
            </p>
          </div>
        </div>
        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 640 }}>
          <span className="mono-label" style={{ color: "var(--amber-text)" }}>Why this audience: </span>
          {campaign.audience.why}
        </p>
      </section>

      {/* ---------- STEP 4 · LAUNCH ---------- */}
      <section className="step-card">
        <div className="step-head">
          <span className="step-num">4</span>
          <h3>Launch</h3>
        </div>
        <div className="checklist">
          {[
            "Copy the assets above into Meta Ads Manager (or export the CSV).",
            `Set the audience: ${campaign.audience.who}, ${campaign.audience.age_range}, ${campaign.audience.radius_miles} mile radius.`,
            `Set ${budget.daily}/day and schedule the ${budget.test.split(" over ")[1]} test flight.`,
            "Mark as launched here, then record results after the flight — that's what sharpens next week.",
          ].map((t, i) => (
            <div key={i}>
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8.5L6.5 12L13 4" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              {t}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
          {metaReady && !campaign.external_id && <LaunchToMetaButton campaignId={campaign.id} />}
          {campaign.external_id && (
            <span className="badge badge--mint" style={{ alignSelf: "center" }}>
              <i />
              In your Meta account · {campaign.external_status ?? "PAUSED"} — results sync daily
            </span>
          )}
          {!launched ? (
            <form action={markLaunchedAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <button type="submit" className={`btn btn-sm ${metaReady ? "btn-ghost" : "btn-primary"}`}>
                Mark as launched
              </button>
            </form>
          ) : (
            <a href="#results" className="btn btn-primary btn-sm">
              Record results ↓
            </a>
          )}
          <CopyAllButton text={copyAll} />
          <a className="btn btn-ghost btn-sm" href={`/app/campaigns/${campaign.id}/export?format=json`}>
            Download JSON
          </a>
          <a className="btn btn-ghost btn-sm" href={`/app/campaigns/${campaign.id}/export?format=csv`}>
            CSV for Meta
          </a>
        </div>
        {!metaReady && (
          <div className="lock-note">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
            One-click launch &amp; auto-synced results — connect your Meta ad account in Settings
          </div>
        )}
      </section>

      {/* ---------- STEP 5 · RECORD (once launched) ---------- */}
      {launched && (
        <section className="step-card" id="results">
          <div className="step-head">
            <span className="step-num">5</span>
            <h3>Results</h3>
          </div>
          <p className="lede">
            Enter what your ad account reports after the flight.
          </p>
          <ResultEntryForm campaignId={campaign.id} />
          {campaignResults.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table className="data-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Impressions</th>
                    <th className="num">Clicks</th>
                    <th className="num">CTR</th>
                    <th className="num">Spend</th>
                    <th className="num">Bookings</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignResults.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="num">{r.impressions === null ? "—" : r.impressions.toLocaleString("en-US")}</td>
                      <td className="num">{r.clicks === null ? "—" : r.clicks.toLocaleString("en-US")}</td>
                      <td className="num" style={{ color: "var(--mint-text)", fontWeight: 600 }}>
                        {r.ctr === null ? "—" : `${(Number(r.ctr) * 100).toFixed(2)}%`}
                      </td>
                      <td className="num">{r.spend_cents === null ? "—" : `$${(r.spend_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</td>
                      <td className="num">{r.bookings === null ? "—" : r.bookings.toLocaleString("en-US")}</td>
                      <td className="num">{r.revenue_cents === null ? "—" : `$${(r.revenue_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link href="/app/results" className="mono-label" style={{ display: "inline-block", marginTop: 16, color: "var(--amber-text)" }}>
            All results
          </Link>
        </section>
      )}
    </div>
  );
}
