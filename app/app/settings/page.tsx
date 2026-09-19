import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import AccountPanel from "@/components/app/account-panel";
import TeamPanel from "@/components/app/team-panel";
import BusinessSettingsForm from "@/components/app/business-settings-form";
import CreativeContextForm from "@/components/app/creative-context-form";
import DocumentUpload from "@/components/app/document-upload";
import { getSessionUser } from "@/lib/auth/session";
import { clearAdHistoryAction, importAdExportAction } from "@/lib/ads/actions";
import { bestTheme, readAdHistory } from "@/lib/ads/history-read";
import type { AdHistory, SocialHandles } from "@/lib/db/types";
import { handleUrl, SOCIAL_PLATFORMS } from "@/lib/import/social-links";
import type { AdTheme } from "@/lib/signals/adlibrary-apify";
import { isSocialReadAvailable } from "@/lib/social";
import { getPlanState, PLAN_LABELS, PLAN_PRICES } from "@/lib/billing";
import { openBillingPortalAction, startCheckoutAction } from "@/lib/billing/actions";
import { seedCompetitorsAction } from "@/lib/intel/actions";
import { adoptDocumentServicesAction, deleteDocumentAction } from "@/lib/documents/actions";
import { MAX_DOCUMENTS } from "@/lib/documents/parse";
import SubmitButton from "@/components/app/submit-button";
import { getUserRepo } from "@/lib/db";
import { sentenceCase } from "@/lib/text";
import {
  isApifyConfigured,
  isDataForSeoConfigured,
  isEmailConfigured,
  isModelConfigured,
  isInstagramConfigured,
  isMetaAdsConfigured,
  isPlacesConfigured,
  isRedditConfigured,
  isStripeConfigured,
  isXConfigured,
  isYoutubeConfigured,
} from "@/lib/env";
import { liveSources, liveSourcesLine, liveSourcesNote } from "@/lib/signals/live-sources";
import {
  addCompetitorAction,
  deleteCompetitorAction,
  disconnectMetaAction,
  updateCompetitorHandlesAction,
} from "@/lib/intel/actions";
import { AD_PLATFORM_OPTIONS, SPEND_BAND_LABELS } from "@/lib/onboarding/market";
import {
  addServiceAction,
  deleteServiceAction,
  toggleServiceAction,
  updateBusinessProfileAction,
  updateSocialHandlesAction,
} from "@/lib/settings/actions";

export const metadata = { title: "Settings — TRND" };

const BILLING_NOTICES: Record<string, { text: string; tone: "mint" | "faint" }> = {
  success: { text: "You're in — the plan is active. Thanks for building with TRND.", tone: "mint" },
  canceled: { text: "Checkout canceled — nothing was charged.", tone: "faint" },
  unconfigured: {
    text: "Billing isn't set up for this workspace yet. Nothing is locked.",
    tone: "faint",
  },
  nocustomer: { text: "No billing profile yet — pick a plan first.", tone: "faint" },
  error: { text: "Billing hit a snag — try again in a moment.", tone: "faint" },
};

const THEME_LINES: Record<AdTheme, string> = {
  education: "teach something",
  offer: "lead with a price or deal",
  scarcity: "set a deadline",
  social_proof: "show customer proof",
  speed: "sell speed and convenience",
  novelty: "announce something new",
};

const PLATFORM_LABELS = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;

/** Codes set by lib/ads/actions.ts. Only numbers ride along in the URL. */
function adsNotice(code: string, params: Record<string, string | string[] | undefined>) {
  const num = (k: string) => Math.max(0, Math.floor(Number(params[k]) || 0));
  const n = num("n");
  const skipped = num("skipped");
  const from = num("p") === 2 ? "Google Ads" : "Meta Ads Manager";
  const ads = `${n} ad${n === 1 ? "" : "s"}`;
  const skippedLine = skipped > 0 ? ` Skipped ${skipped} row${skipped === 1 ? "" : "s"} with no delivery.` : "";
  switch (code) {
    case "imported":
      return { text: `Read ${ads} from ${from}. They replace your last ${from} upload.${skippedLine}`, tone: "mint" as const };
    case "trimmed":
      return { text: `Read ${ads} from ${from}, the ones that reached the most people.${skippedLine}`, tone: "mint" as const };
    case "cleared":
      return { text: "Your past ads are cleared.", tone: "faint" as const };
    case "nofile":
      return { text: "Pick a file to upload first.", tone: "red" as const };
    case "toobig":
      return { text: "That file is over 5 MB. Export a shorter date range and try again.", tone: "red" as const };
    case "notexport":
      return {
        text: "This doesn't look like an ad export. From Meta, export Campaign name, Impressions and Amount spent. From Google Ads, download a report with Campaign, Impr. and Cost.",
        tone: "red" as const,
      };
    case "empty":
      return { text: "We found the columns but no ads with any delivery. Check the date range and export again.", tone: "red" as const };
    case "error":
      return { text: "That upload didn't go through. Try again in a moment.", tone: "red" as const };
    default:
      return null;
  }
}

const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 2 : 1)}%`;
const adCtr = (r: AdHistory) => (r.impressions && r.clicks !== null ? r.clicks / r.impressions : r.ctr);

/** Past these counts a list folds; the page stays a page, not a scroll. */
const SERVICES_SHOWN = 12;
const COMPETITORS_SHOWN = 8;

/**
 * The first `shown` items as they are, the rest behind a native disclosure.
 * Every item still renders (each carries its own forms), so nothing here
 * needs the client; a long list just stops making a long page.
 */
function FoldedList<T>({
  items,
  shown,
  noun,
  children,
}: {
  items: T[];
  shown: number;
  noun: string;
  children: (item: T) => ReactNode;
}) {
  const rest = items.slice(shown);
  return (
    <>
      {items.slice(0, shown).map((item) => children(item))}
      {rest.length > 0 && (
        <details>
          <summary className="mono-label cursor-pointer text-ink-faint">
            Show all {items.length} {noun}
          </summary>
          <div className="flex flex-col gap-[10px] mt-[10px]">{rest.map((item) => children(item))}</div>
        </details>
      )}
    </>
  );
}

function HandleLinks({ handles }: { handles: SocialHandles }) {
  const set = SOCIAL_PLATFORMS.filter((p) => handles[p]);
  if (set.length === 0) return null;
  return (
    <span className="flex gap-3 flex-wrap">
      {set.map((p) => (
        <a
          key={p}
          href={handleUrl(p, handles[p]!)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-ink-soft underline"
        >
          {PLATFORM_LABELS[p]} @{handles[p]}
        </a>
      ))}
    </span>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");
  const params = await searchParams;
  const connectError = typeof params.connect_error === "string" ? params.connect_error : null;
  const justConnected = typeof params.connected === "string" ? params.connected : null;
  const billingFlag = String(params.billing ?? "");
  const billingNotice = BILLING_NOTICES[billingFlag] ?? null;
  const adsFlag = String(params.ads ?? "");
  const adNotice = adsNotice(adsFlag, params);
  const [services, rivals, metaConnection, gbpConnection, plan, documents, adRows, members] = await Promise.all([
    repo.listServices(business.id),
    repo.listCompetitors(business.id),
    repo.getConnection(business.id, "meta"),
    repo.getConnection(business.id, "google_business"),
    getPlanState(repo, business),
    repo.listDocuments(business.id),
    repo.listAdHistory(business.id).catch((err: Error) => {
      console.warn("[settings] ad history read failed (non-fatal):", err.message);
      return [] as AdHistory[];
    }),
    repo.listMembers(business.id).catch(() => []),
  ]);
  const isOwner = business.owner_id === user.id;
  // Most direct rivals first; ones not yet scored sit at the bottom.
  const competitors = [...rivals].sort((a, b) => (b.directness ?? -1) - (a.directness ?? -1));
  const adRead = adRows.length > 0 ? readAdHistory(adRows) : null;
  const adTheme = adRows.length > 0 ? bestTheme(adRows) : null;
  const bestAd = adRead?.best[0] ?? null;
  const bestAdCtr = bestAd ? adCtr(bestAd) : null;
  const socialReadOn = isSocialReadAvailable();
  const ownHandles = business.social_handles ?? {};
  const serviceNames = new Set(services.map((s) => s.name.trim().toLowerCase()));
  const newItemsIn = (d: (typeof documents)[number]) =>
    d.digest.services_found.filter((x) => !serviceNames.has(x.name.trim().toLowerCase())).length;

  const metaConnected = metaConnection?.status === "connected";
  const integrations = [
    {
      name: "Meta ad account",
      detail: metaConnected
        ? `${metaConnection?.account_name ?? metaConnection?.account_id ?? "Connected"}`
        : isMetaAdsConfigured
          ? "Ready to connect"
          : "Not available yet",
      ok: metaConnected,
      note: metaConnected
        ? "Your account's last 180 days of ads sync daily, and a test named the way its brief says gets its results by that name."
        : isMetaAdsConfigured
          ? "Connect to sync your own ad history daily, so briefs are graded against it and tests get their results without an upload."
          : "Results come from your Ads Manager export until ad-account sync is available for your workspace.",
      action: metaConnected ? ("disconnect-meta" as const) : isMetaAdsConfigured ? ("connect-meta" as const) : null,
    },
    {
      name: "Google reviews",
      detail: gbpConnection
        ? `${gbpConnection.account_name ?? "Listing found"}`
        : isPlacesConfigured
          ? "Finding your listing"
          : "Not available yet",
      ok: Boolean(gbpConnection),
      note: isPlacesConfigured
        ? "Your reviews and competitors' ratings are read daily."
        : "Review reading isn't available for your workspace yet.",
      action: null,
    },
    {
      name: "Weekly email",
      detail: isEmailConfigured ? "Sending every Monday" : "Not sending yet",
      ok: isEmailConfigured,
      note: isEmailConfigured ? "The Monday report lands in your inbox." : "The report is always available here every week.",
      action: null,
    },
    // Only the reads that actually run with the keys as set: a source named
    // here is one that has written rows, never one that could.
    (() => {
      const sources = liveSources({
        dataForSeo: isDataForSeoConfigured,
        youtube: isYoutubeConfigured,
        apify: isApifyConfigured,
        reddit: isRedditConfigured,
        x: isXConfigured,
        instagram: isInstagramConfigured,
      });
      return {
        name: "Market reads",
        detail: liveSourcesLine(sources),
        ok: true,
        note: liveSourcesNote(sources, isDataForSeoConfigured),
        action: null,
      };
    })(),
  ];

  return (
    <div className="page max-w-[900px]">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="context">
            Your category, services, and radius decide what gets recommended.
          </p>
        </div>
      </div>

      <section className="panel mb-5">
        <div className="panel__head">
          <span className="panel__title">Business</span>
          <span className="flex gap-3 items-center">
            <span className="panel__meta">{user.email}</span>
            <Link href="/app/snapshot" className="btn btn-ghost btn-sm">Your analysis</Link>
          </span>
        </div>
        <BusinessSettingsForm business={business} />
        <div className="mt-5 pt-4 border-t border-dashed border-line" id="market">
          <p className="font-disp font-semibold text-[14.5px] mx-0 mt-0 mb-1">How you sell</p>
          <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-3 leading-[1.55]">
            Online brands are read against competing brands nationally. Local businesses are read against the places near them.
          </p>
          <form action={updateBusinessProfileAction}>
            {/* Outside .field, whose input and label styles are for text boxes. */}
            <div className="mb-[18px]">
              <span className="mono-label block mb-2">Market</span>
              <div className="flex gap-4 flex-wrap">
                {(
                  [
                    ["online", "Online DTC brand"],
                    ["local", "Local business"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-[13.5px] cursor-pointer">
                    <input type="radio" name="market" value={value} defaultChecked={business.market === value} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="st-spend">Monthly paid social spend</label>
              <select id="st-spend" name="monthly_ad_spend" defaultValue={business.monthly_ad_spend ?? ""}>
                <option value="">Not set</option>
                {Object.entries(SPEND_BAND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-[18px]">
              <span className="mono-label block mb-2">Where you run ads</span>
              <div className="flex gap-4 flex-wrap">
                {AD_PLATFORM_OPTIONS.map((p) => (
                  <label key={p.value} className="flex items-center gap-2 text-[13.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      name="ad_platforms"
                      value={p.value}
                      defaultChecked={(business.ad_platforms ?? []).includes(p.value)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </form>
        </div>
        <div className="mt-5 pt-4 border-t border-dashed border-line" id="accounts">
          <p className="font-disp font-semibold text-[14.5px] mx-0 mt-0 mb-1">Your accounts</p>
          <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-3 leading-[1.55]">
            TRND reads your recent posts to see what your customers already respond to.
          </p>
          <div className="mb-3">
            <HandleLinks handles={ownHandles} />
          </div>
          <form className="flex gap-[10px] flex-wrap" action={updateSocialHandlesAction}>
            {SOCIAL_PLATFORMS.map((p) => (
              <input
                key={p}
                name={p}
                defaultValue={ownHandles[p] ?? ""}
                placeholder={`${PLATFORM_LABELS[p]} handle or link`}
                aria-label={`${PLATFORM_LABELS[p]} handle`}
                className="input flex-[1_1_180px]"
              />
            ))}
            <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Saving…">
              Save accounts
            </SubmitButton>
          </form>
          {!socialReadOn && (
            <p className="text-[12px] text-ink-faint mx-0 mt-2 mb-0">
              Posts are read once social reading is switched on for your workspace.
            </p>
          )}
        </div>
      </section>

      <section className="panel mb-5">
        <div className="panel__head">
          <span className="panel__title">Services</span>
          <span className="panel__meta">{services.filter((s) => s.is_active).length} active</span>
        </div>
        <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-4">
          Inactive services stay listed but stop matching signals.
        </p>
        <div className="flex flex-col gap-[10px] mb-5">
          <FoldedList items={services} shown={SERVICES_SHOWN} noun="services">
            {(s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-1)",
                opacity: s.is_active ? 1 : 0.55,
                flexWrap: "wrap",
              }}
            >
              <span className="font-disp font-semibold text-[14.5px] flex-[1_1_200px]">
                {s.name}
              </span>
              <span className="mono-label">
                {s.price_cents ? `$${Math.round(s.price_cents / 100)}` : "no price"}
              </span>
              <div className="flex gap-2">
                <form action={toggleServiceAction}>
                  <input type="hidden" name="service_id" value={s.id} />
                  <input type="hidden" name="active" value={String(!s.is_active)} />
                  <button type="submit" className="btn btn-ghost btn-sm py-[5px] px-3 text-[11.5px]">
                    {s.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteServiceAction}>
                  <input type="hidden" name="service_id" value={s.id} />
                  <button type="submit" className="btn btn-ghost btn-sm py-[5px] px-3 text-[11.5px] text-red">
                    Remove
                  </button>
                </form>
              </div>
            </div>
            )}
          </FoldedList>
          {services.length === 0 && (
            <p className="text-[13.5px] text-ink-faint m-0">
              No services yet — add what you sell so signals can match.
            </p>
          )}
        </div>
        <form className="flex gap-[10px] flex-wrap" action={addServiceAction}>
          <input
            name="name"
            placeholder="New service name"
            aria-label="New service name"
            className="input flex-[1_1_220px]"
          />
          <input
            name="price"
            placeholder="$ price"
            aria-label="New service price"
            className="input w-[110px]"
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Add service
          </button>
        </form>
      </section>

      <section className="panel mb-5" id="documents">
        <div className="panel__head">
          <span className="panel__title">Your documents</span>
          <span className="panel__meta">{documents.length} of {MAX_DOCUMENTS} documents</span>
        </div>
        <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-4 max-w-[640px] leading-[1.55]">
          Menus, sales exports, brand notes, past ad results. TRND keeps the facts, not the file, and
          uses them in every recommendation.
        </p>
        {documents.length > 0 && (
          <div className="flex flex-col gap-[10px] mb-[18px]">
            {documents.map((d) => {
              const adoptable = newItemsIn(d);
              return (
                <div className="py-3 px-[14px] border border-line rounded-card-sm bg-bg-1" key={d.id}>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="font-disp font-semibold text-[14.5px] flex-[1_1_200px]">{d.name}</span>
                    <span className="badge"><i />{sentenceCase(d.digest.kind)}</span>
                    <span className="mono-label">{d.digest.facts.length} fact{d.digest.facts.length === 1 ? "" : "s"}</span>
                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className="btn btn-ghost btn-sm">Remove</button>
                    </form>
                  </div>
                  <p className="mx-0 mt-2 mb-0 text-[13px] leading-[1.55] text-ink-soft">{d.digest.summary}</p>
                  {d.digest.facts.length > 0 && (
                    <details className="mt-2">
                      <summary className="mono-label cursor-pointer text-ink-faint">Facts</summary>
                      {d.digest.facts.map((f) => (
                        <p className="mx-0 mt-[6px] mb-0 text-[12.5px] leading-[1.5] text-ink-soft" key={f.slice(0, 40)}>· {f}</p>
                      ))}
                    </details>
                  )}
                  {adoptable > 0 && (
                    <form className="mt-[10px]" action={adoptDocumentServicesAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Adding…">
                        Add {adoptable} item{adoptable === 1 ? "" : "s"} to services
                      </SubmitButton>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {documents.length < MAX_DOCUMENTS && <DocumentUpload modelReady={isModelConfigured} />}
      </section>

      <section className="panel mb-5" id="context">
        <div className="panel__head">
          <span className="panel__title">What a brief needs to know</span>
          <span className="panel__meta">{(business.campaign_objectives ?? []).length > 0 ? "Set" : "Not set"}</span>
        </div>
        <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-4 max-w-[640px] leading-[1.55]">
          What your campaigns buy, what you can make, what you shot last and what you may claim. Every brief reads this, and the
          evaluation plan names the right numbers only once the objectives are set.
        </p>
        <CreativeContextForm business={business} services={services} />
      </section>

      <section className="panel mb-5" id="ads">
        <div className="panel__head">
          <span className="panel__title">Your past ads</span>
          <span className="panel__meta">
            {adRead ? `${adRead.ads} ad${adRead.ads === 1 ? "" : "s"}` : "None yet"}
          </span>
        </div>
        <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-4 max-w-[640px] leading-[1.55]">
          {isMetaAdsConfigured && !metaConnected ? (
            <>
              <Link href="#integrations">Connect Meta</Link> and TRND reads your last 180 days of ads from the account itself, no
              export needed. Or export your results from Meta Ads Manager or Google Ads (CSV or Excel, at the ad level).
            </>
          ) : (
            "Export your results from Meta Ads Manager or Google Ads (CSV or Excel, at the ad level)."
          )}{" "}
          It gives each brief a real reference ad and your own baseline, and stops TRND repeating ideas that already failed. An export carries numbers, ad
          names and, when the columns are there, headline and body text. It does not carry the creative itself, so what an ad
          showed is read from its name and copy only.
        </p>

        {adNotice && (
          <p
            className={`font-mono text-[11.5px] leading-[1.55] mx-0 mt-0 mb-4 pb-3 border-b border-dashed border-line ${
              adNotice.tone === "mint" ? "text-(--mint-text)" : adNotice.tone === "red" ? "text-red" : "text-ink-faint"
            }`}
          >
            {adNotice.text}
          </p>
        )}

        {adRead && (
          <div className="py-3 px-[14px] border border-line rounded-card-sm bg-bg-1 mb-[18px]">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="mono-label">{adRead.ads} ad{adRead.ads === 1 ? "" : "s"}</span>
              <span className="mono-label">
                ${Math.round(adRead.spendCents / 100).toLocaleString("en-US")} spent
              </span>
              {adRead.accountCtr !== null && (
                <span className="mono-label">{pct(adRead.accountCtr)} click rate</span>
              )}
              <span className="flex-1" />
              <form action={clearAdHistoryAction}>
                <button type="submit" className="btn btn-ghost btn-sm py-[5px] px-3 text-[11.5px] text-red">
                  Clear
                </button>
              </form>
            </div>
            {bestAd && bestAdCtr !== null && (
              <p className="mx-0 mt-2 mb-0 text-[13px] leading-[1.55] text-ink-soft">
                Your best ad: {bestAd.ad_name ?? bestAd.campaign_name}, at {pct(bestAdCtr)} click rate.
              </p>
            )}
            {adTheme && adTheme.vsAccount >= 1.05 && (
              <p className="mx-0 mt-1 mb-0 text-[13px] leading-[1.55] text-ink-soft">
                Ads that {THEME_LINES[adTheme.theme]} ran {Math.round((adTheme.vsAccount - 1) * 100)}% above your average.
              </p>
            )}
          </div>
        )}

        <form className="flex gap-[10px] flex-wrap items-center" action={importAdExportAction}>
          <input
            name="file"
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Ad export to upload"
            className="input py-[9px] px-3 flex-[1_1_260px]"
            required
          />
          <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Reading…">
            {adRead ? "Upload a new export" : "Upload export"}
          </SubmitButton>
        </form>
      </section>

      <section className="panel mb-5" id="billing">
        <div className="panel__head">
          <span className="panel__title">Plan and billing</span>
          <span className="panel__meta">
            {PLAN_LABELS[plan.plan]}
            {plan.plan !== "trial" ? ` · ${PLAN_PRICES[plan.plan]}` : ""}
          </span>
        </div>

        {billingNotice && (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11.5,
              lineHeight: 1.55,
              color: billingNotice.tone === "mint" ? "var(--mint-text)" : "var(--ink-faint)",
              margin: "0 0 16px",
              paddingBottom: 12,
              borderBottom: "1px dashed var(--line)",
            }}
          >
            {billingNotice.text}
          </p>
        )}

        <div className="flex items-center gap-[14px] flex-wrap mb-4">
          <span className={`badge${plan.status === "active" ? " badge--mint" : plan.locked ? "" : " badge--mint"}`}>
            <i />
            {plan.plan === "trial"
              ? plan.locked
                ? "trial ended"
                : `trial · ${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} left`
              : sentenceCase(plan.status.replace(/_/g, " "))}
          </span>
          <p className="text-[13.5px] text-ink-soft m-0 leading-[1.55]">
            {plan.plan === "trial"
              ? plan.locked
                ? "Every brief you received stays yours. Pick a plan to keep the weekly creative tests coming."
                : "Full product, no card on file. Pick a plan any time; founding brands lock their price."
              : "Up to three creative test briefs a week, your rivals read weekly, and the Monday email in your inbox. What you record sharpens the next week."}
          </p>
        </div>

        {isStripeConfigured ? (
          <div className="flex gap-[10px] flex-wrap">
            {plan.plan !== "baseline" && plan.status !== "active" && (
              <form action={startCheckoutAction}>
                <input type="hidden" name="plan" value="baseline" />
                <button type="submit" className="btn btn-primary btn-sm">
                  Start TRND — {PLAN_PRICES.baseline}
                </button>
              </form>
            )}
            {plan.subscription.stripe_customer_id && (
              <form action={openBillingPortalAction}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  Manage billing
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-faint m-0 leading-[1.6]">
            Payments aren&apos;t set up for this workspace yet. Your trial continues and nothing is locked.
          </p>
        )}
      </section>

      <section className="panel mb-5" id="team">
        <div className="panel__head">
          <span className="panel__title">Team</span>
          <span className="panel__meta">{members.length + 1} {members.length === 0 ? "person" : "people"}</span>
        </div>
        <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-4">
          The media buyer, the strategist, whoever shoots the ads. A teammate sees this week&apos;s tests, the campaigns and the
          record; only the owner edits the brand and the roster. A creator who will never log in gets a share link from the brief instead.
        </p>
        <TeamPanel members={members} isOwner={isOwner} ownerEmail={isOwner ? user.email : "the owner"} />
      </section>

      <section className="panel mb-5" id="account">
        <div className="panel__head">
          <span className="panel__title">Account</span>
          <span className="panel__meta">Password and data</span>
        </div>
        <AccountPanel email={user.email} />
      </section>

      <section className="panel mb-5">
        <div className="panel__head">
          <span className="panel__title">Competitors</span>
          <span className="panel__meta">{competitors.length} tracked</span>
        </div>
        <p className="text-[13px] text-ink-faint mx-0 mt-0 mb-4">
          Name the local rivals that matter. TRND reads their ads, posts and Google ratings
          daily. Moves show up in your intel report and as alerts. The closest rivals are listed first.
        </p>
        <div className="flex flex-col gap-[10px] mb-5">
          <FoldedList items={competitors} shown={COMPETITORS_SHOWN} noun="competitors">
            {(c) => {
            const handles = c.social_handles ?? {};
            return (
              <div className="py-3 px-[14px] border border-line rounded-card-sm bg-bg-1" key={c.id}>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col gap-1 flex-[1_1_200px] min-w-0">
                    <span className="font-disp font-semibold text-[14.5px]">{c.name}</span>
                    <HandleLinks handles={handles} />
                    {c.directness_reason && (
                      <span className="text-[12px] text-ink-faint leading-[1.5]">{c.directness_reason}</span>
                    )}
                  </div>
                  <span className="mono-label">{c.place_id ? "Listing found" : c.website ?? "Watching ads"}</span>
                  <form action={deleteCompetitorAction}>
                    <input type="hidden" name="competitor_id" value={c.id} />
                    <button type="submit" className="btn btn-ghost btn-sm py-[5px] px-3 text-[11.5px] text-red">
                      Stop watching
                    </button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="mono-label cursor-pointer text-ink-faint">
                    {SOCIAL_PLATFORMS.some((p) => handles[p]) ? "Edit accounts" : "Add accounts"}
                  </summary>
                  <form className="flex gap-2 flex-wrap mt-2" action={updateCompetitorHandlesAction}>
                    <input type="hidden" name="competitor_id" value={c.id} />
                    {SOCIAL_PLATFORMS.map((p) => (
                      <input
                        key={p}
                        name={p}
                        defaultValue={handles[p] ?? ""}
                        placeholder={PLATFORM_LABELS[p]}
                        aria-label={`${c.name} ${PLATFORM_LABELS[p]} handle`}
                        className="input flex-[1_1_140px] py-[6px] text-[12.5px]"
                      />
                    ))}
                    <SubmitButton className="btn btn-ghost btn-sm py-[5px] px-3 text-[11.5px]" pendingLabel="Saving…">
                      Save
                    </SubmitButton>
                  </form>
                </details>
              </div>
            );
            }}
          </FoldedList>
          {competitors.length === 0 && (
            <p className="text-[13.5px] text-ink-faint m-0">
              No competitors yet. Find the nearest ones, or add one by name.
            </p>
          )}
        </div>
        {isPlacesConfigured && competitors.length < 5 && (
          <form className="mb-[14px]" action={seedCompetitorsAction}>
            <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Finding…">
              Find nearby competitors
            </SubmitButton>
            <span className="mono-label ml-[10px]">Same category, within 10 miles</span>
          </form>
        )}
        <form className="flex gap-[10px] flex-wrap" action={addCompetitorAction}>
          <input
            name="name"
            placeholder="Competitor name"
            aria-label="Competitor name"
            className="input flex-[1_1_240px]"
          />
          <input
            name="website"
            placeholder="Website (optional)"
            aria-label="Competitor website"
            className="input w-[200px]"
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Watch competitor
          </button>
        </form>
      </section>

      <section className="panel" id="integrations">
        <div className="panel__head">
          <span className="panel__title">Integrations</span>
          <span className="panel__meta">What powers your briefs</span>
        </div>
        {connectError && (
          <p className="mx-0 mt-0 mb-[14px] font-mono text-[12px] text-red">
            {connectError}
          </p>
        )}
        {justConnected && (
          <p className="mx-0 mt-0 mb-[14px] font-mono text-[12px] text-(--mint-text)">
            Connected. Your ad history syncs tonight; a test named the way its brief says gets its results from then on.
          </p>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(220px,_1fr))] gap-[14px]">
          {integrations.map((it) => (
            <div key={it.name} className="card py-4 px-[18px] flex flex-col">
              <span className={`badge${it.ok ? " badge--mint" : " badge--faint"} self-start`}>
                <i />
                {it.ok ? "active" : "not connected"}
              </span>
              <p className="font-disp font-semibold text-[14.5px] mx-0 mt-[10px] mb-[3px]">{it.name}</p>
              <p className="font-mono text-[11px] text-ink-soft mx-0 mt-0 mb-2">{it.detail}</p>
              <p className="text-[12px] text-ink-faint mx-0 mt-0 mb-[10px] leading-[1.5] flex-1">{it.note}</p>
              {it.action === "connect-meta" && (
                <Link href="/api/connect/meta" className="btn btn-primary btn-sm self-start">
                  Connect Meta
                </Link>
              )}
              {it.action === "disconnect-meta" && (
                <form action={disconnectMetaAction}>
                  <button type="submit" className="btn btn-ghost btn-sm text-[11.5px]">
                    Disconnect
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
