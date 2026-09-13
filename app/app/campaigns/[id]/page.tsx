import "../campaigns.css";

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
import { statusChip } from "@/lib/campaigns/view";
import { getUserRepo } from "@/lib/db";
import type { Creative } from "@/lib/db/types";
import { shortDate } from "@/lib/picks/list";
import { forecastFlight, forecastLine } from "@/lib/recommend/forecast";
import { tiktokHashtag, trendLinks } from "@/lib/recommend/howto";
import { budgetFor, creativeTestBudgetFor } from "@/lib/recommend/insights";
import { sentenceCase } from "@/lib/text";

export const metadata = { title: "Campaign — TRND" };

const KIND_LABELS: Record<Creative["kind"], string> = {
  headline: "Headline",
  primary_text: "Primary text",
  script: "Video script",
  static_brief: "Static brief",
  landing_copy: "Landing copy",
};

const fmtMoney = (cents: number | null) =>
  cents === null ? "—" : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));

/**
 * One campaign, whole. The head is the headline with the term and the
 * service under it; then the status and its actions, the results once it
 * is live, and the plan on the left with the in-feed preview on the right;
 * then the copy to run.
 */
export default async function CampaignPage({ params }: PageProps<"/app/campaigns/[id]">) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const campaign = await repo.getCampaign(id);
  if (!campaign) notFound();
  const [creatives, opportunity, business, metaConnection, services] = await Promise.all([
    repo.listCreatives(id),
    repo.getOpportunity(campaign.opportunity_id),
    repo.getBusiness(campaign.business_id),
    repo.getConnection(campaign.business_id, "meta"),
    repo.listServices(campaign.business_id),
  ]);
  const metaReady = metaConnection?.status === "connected" && Boolean(metaConnection.account_id);
  const campaignResults = (await repo.listResultsForBusiness(campaign.business_id)).filter(
    (r) => r.campaign_id === campaign.id,
  );
  const signal = opportunity ? await repo.getSignal(opportunity.signal_id) : null;
  const service = opportunity?.matched_service_id
    ? (services.find((s) => s.id === opportunity.matched_service_id) ?? null)
    : null;

  const byKind = (kind: Creative["kind"]) => creatives.filter((c) => c.kind === kind);
  const headlines = byKind("headline");
  const primaries = byKind("primary_text");
  const scripts = byKind("script");
  const briefs = byKind("static_brief");
  const landing = byKind("landing_copy");
  const budget = budgetFor(business?.price_band ?? null);
  // An online brand tests with a share of its monthly spend, not $25 a day.
  const onlineTest = business?.market === "online" ? creativeTestBudgetFor(business.monthly_ad_spend) : null;
  // An online DTC brand's ads run nationwide; its location is not a factor.
  const nationwide = business?.market === "online";
  const where = nationwide ? "Nationwide, United States" : `${campaign.audience.radius_miles} miles from you`;

  const copyAll = [
    `ANGLE\n${campaign.angle}`,
    `HOOK\n${campaign.hook}`,
    `OFFER\n${campaign.offer}`,
    `AUDIENCE\n${campaign.audience.who} · ${campaign.audience.age_range} · ${nationwide ? "nationwide" : `${campaign.audience.radius_miles}mi`}\nWhy: ${campaign.audience.why}`,
    ...(["headline", "primary_text", "script", "static_brief", "landing_copy"] as const).map(
      (kind) =>
        `${KIND_LABELS[kind].toUpperCase()}S\n` +
        byKind(kind)
          .map((c, i) => `${i + 1}. ${c.content}`)
          .join("\n\n"),
    ),
  ].join("\n\n———\n\n");

  const launched = campaign.status === "live" || campaign.status === "complete";
  const chip = statusChip(campaign.status);
  const links = signal ? trendLinks(signal.term, { hashtag: tiktokHashtag(signal) }) : null;
  const context = [signal ? sentenceCase(signal.term) : null, service?.name ?? null].filter(Boolean).join(" · ");

  const plan: { label: string; value: string; mono?: boolean }[] = [
    { label: "Angle", value: campaign.angle },
    { label: "Offer", value: campaign.offer },
    { label: "Budget", value: onlineTest ?? `${budget.daily} / day`, mono: true },
    { label: "Audience", value: `${campaign.audience.who} · ${campaign.audience.age_range}` },
    { label: "Where", value: where },
    {
      label: "Flight",
      value: onlineTest
        ? "Run it against your current best ad at the same budget, and keep the winner."
        : "Days 1–3, headline 1 against headline 2 on primary text 1; days 4–6, keep the winner and swap in primary text 2.",
    },
    { label: "Kill rule", value: "Pause anything under half your median CTR after 1,000 impressions." },
    { label: "Why them", value: campaign.audience.why },
  ];
  if (!onlineTest) {
    plan.splice(7, 0, {
      label: "Expect",
      value: forecastLine(forecastFlight({ daily: budget.daily, category: business?.category ?? "" })),
    });
  }

  return (
    <div className="page campd">
      <Link href="/app/campaigns" className="mono-label campd__back">
        All campaigns
      </Link>

      <div className="page-head">
        <div>
          <span className="eyebrow m-0">Campaign · built {shortDate(campaign.created_at)}</span>
          <h1>{sentenceCase(campaign.hook)}</h1>
          {context && <p className="context">{context}</p>}
        </div>
      </div>

      <div className="campd__top">
        <div className="campd__col">
          <section className="campd__card campd__status" aria-labelledby="campd-status">
            <div className="campd__card-head">
              <h2 id="campd-status" className="campd__h2">
                Status
              </h2>
              <span className={`badge${chip.tone ? ` badge--${chip.tone}` : ""}`}>
                <i />
                {chip.label}
              </span>
            </div>
            <StatusTimeline status={campaign.status} />
            <div className="campd__actions">
              {metaReady && !campaign.external_id && <LaunchToMetaButton campaignId={campaign.id} />}
              {campaign.external_id && (
                <span className="badge badge--mint">
                  <i />
                  In your Meta account · {campaign.external_status ?? "PAUSED"}
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
                  Record results
                </a>
              )}
              <CopyAllButton text={copyAll} />
              <a className="btn btn-ghost btn-sm" href={`/app/campaigns/${campaign.id}/export?format=csv`}>
                CSV for Meta
              </a>
              <a className="btn btn-ghost btn-sm" href={`/app/campaigns/${campaign.id}/export?format=json`}>
                JSON
              </a>
            </div>
            {!metaReady && (
              <p className="campd__note">
                Connect your Meta ad account in <Link href="/app/settings">Settings</Link> to launch from here and
                sync results.
              </p>
            )}
          </section>

          {launched && (
            <section className="campd__card" id="results" aria-labelledby="campd-results">
              <div className="campd__card-head">
                <h2 id="campd-results" className="campd__h2">
                  Results
                </h2>
                {campaignResults.length > 0 && (
                  <span className="campd__card-meta">
                    {campaignResults.length} {campaignResults.length === 1 ? "entry" : "entries"}
                  </span>
                )}
              </div>
              <ResultEntryForm campaignId={campaign.id} />
              {campaignResults.length > 0 && (
                <div className="campd__table">
                  <table className="data-table">
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
                          <td className="whitespace-nowrap">{shortDate(r.recorded_at)}</td>
                          <td className="num">{fmtNum(r.impressions)}</td>
                          <td className="num">{fmtNum(r.clicks)}</td>
                          <td className="num">{r.ctr === null ? "—" : `${(Number(r.ctr) * 100).toFixed(2)}%`}</td>
                          <td className="num">{fmtMoney(r.spend_cents)}</td>
                          <td className="num">{fmtNum(r.bookings)}</td>
                          <td className="num">{fmtMoney(r.revenue_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link href="/app/results" className="mono-label campd__link">
                All results
              </Link>
            </section>
          )}

          <section className="campd__card" aria-labelledby="campd-plan">
            <h2 id="campd-plan" className="campd__h2">
              The plan
            </h2>
            <dl className="campd__rows">
              {plan.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd className={row.mono ? "is-mono" : undefined}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="campd__col campd__col--side">
          <section className="campd__card campd__preview" aria-labelledby="campd-preview">
            <h2 id="campd-preview" className="campd__h2">
              In-feed preview
            </h2>
            <AdPreview
              businessName={business?.name ?? "Your business"}
              primaryText={primaries[0]?.content ?? campaign.angle}
              headline={headlines[0]?.content ?? campaign.hook}
              mediaLine={campaign.offer}
              imageUrl={(business?.photo_urls ?? [])[0] ?? null}
            />
          </section>
        </div>
      </div>

      <div className="campd__work">
        {headlines.length > 0 && (
          <section className="campd__card" aria-labelledby="campd-headlines">
            <h2 id="campd-headlines" className="campd__h2">
              Headlines
            </h2>
            <div className="campd__copy-grid">
              {headlines.map((c) => (
                <CopyBlock key={c.id} label={`Headline ${c.variant_index + 1}`} content={c.content} />
              ))}
            </div>
          </section>
        )}

        {primaries.length > 0 && (
          <section className="campd__card" aria-labelledby="campd-primary">
            <h2 id="campd-primary" className="campd__h2">
              Primary text
            </h2>
            <div className="campd__copy-stack">
              {primaries.map((c) => (
                <CopyBlock key={c.id} label={`Primary text ${c.variant_index + 1}`} content={c.content} />
              ))}
            </div>
          </section>
        )}

        {(scripts.length > 0 || briefs.length > 0 || landing.length > 0) && (
          <section className="campd__card" aria-labelledby="campd-more">
            <h2 id="campd-more" className="campd__h2">
              More to run
            </h2>
            {scripts.length > 0 && (
              <details className="campd__more">
                <summary>
                  <span>Video scripts</span>
                  <span className="campd__card-meta">{scripts.length} · 20–30s each</span>
                </summary>
                <div className="campd__more-body campd__copy-grid">
                  {scripts.map((c) => (
                    <CopyBlock key={c.id} label={`Script ${c.variant_index + 1}`} content={c.content} mono />
                  ))}
                </div>
              </details>
            )}
            {briefs.length > 0 && (
              <details className="campd__more">
                <summary>
                  <span>Shot directions</span>
                  <span className="campd__card-meta">{briefs.length}, each doable on a phone</span>
                </summary>
                <div className="campd__more-body">
                  <ol className="campd__directions">
                    {briefs.map((c) => (
                      <li key={c.id}>{c.content}</li>
                    ))}
                  </ol>
                </div>
              </details>
            )}
            {landing.length > 0 && (
              <details className="campd__more">
                <summary>
                  <span>Landing copy</span>
                </summary>
                <div className="campd__more-body campd__copy-stack">
                  {landing.map((c) => (
                    <CopyBlock key={c.id} label="Landing section" content={c.content} />
                  ))}
                </div>
              </details>
            )}
            {links && (
              <div className="campd__refs">
                <a className="btn btn-ghost btn-sm" href={links.tiktok} target="_blank" rel="noopener noreferrer">
                  What&apos;s running on TikTok
                </a>
                <a className="btn btn-ghost btn-sm" href={links.instagram} target="_blank" rel="noopener noreferrer">
                  What&apos;s running on Instagram
                </a>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
