import Link from "next/link";
import { redirect } from "next/navigation";

import AccountPanel from "@/components/app/account-panel";
import BusinessSettingsForm from "@/components/app/business-settings-form";
import DocumentUpload from "@/components/app/document-upload";
import { getSessionUser } from "@/lib/auth/session";
import { getPlanState, PLAN_LABELS, PLAN_PRICES } from "@/lib/billing";
import { openBillingPortalAction, startCheckoutAction } from "@/lib/billing/actions";
import { seedCompetitorsAction } from "@/lib/intel/actions";
import { adoptDocumentServicesAction, deleteDocumentAction } from "@/lib/documents/actions";
import { MAX_DOCUMENTS } from "@/lib/documents/parse";
import SubmitButton from "@/components/app/submit-button";
import { getUserRepo } from "@/lib/db";
import {
  isDataForSeoConfigured,
  isEmailConfigured,
  isGeminiConfigured,
  isMetaAdsConfigured,
  isPlacesConfigured,
  isStripeConfigured,
} from "@/lib/env";
import { addCompetitorAction, deleteCompetitorAction, disconnectMetaAction } from "@/lib/intel/actions";
import {
  addServiceAction,
  deleteServiceAction,
  toggleServiceAction,
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

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const params = await searchParams;
  const connectError = typeof params.connect_error === "string" ? params.connect_error : null;
  const justConnected = typeof params.connected === "string" ? params.connected : null;
  const billingFlag = String(params.billing ?? "");
  const billingNotice = BILLING_NOTICES[billingFlag] ?? null;
  const [services, competitors, metaConnection, gbpConnection, plan, documents] = await Promise.all([
    repo.listServices(business.id),
    repo.listCompetitors(business.id),
    repo.getConnection(business.id, "meta"),
    repo.getConnection(business.id, "google_business"),
    getPlanState(repo, business),
    repo.listDocuments(business.id),
  ]);
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
        ? "Launched campaigns sync their results back every day."
        : isMetaAdsConfigured
          ? "Connect to launch campaigns from TRND and sync results automatically."
          : "Results are entered by hand until ad-account sync is available for your workspace.",
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
    {
      name: "Market reads",
      detail: isDataForSeoConfigured
        ? "Search volume by metro, Google Trends, weather, autocomplete, news, Meta ads, TikTok, YouTube"
        : "Google Trends, weather, autocomplete, news, Meta ads, TikTok, YouTube",
      ok: true,
      note: isDataForSeoConfigured
        ? "Refreshed daily. Search volume is measured in your metro."
        : "Refreshed daily. Search reads are national until metro volume is available for your workspace.",
      action: null,
    },
  ];

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>Settings</span>
          <h1>Your business profile.</h1>
          <p className="context">
            Everything here shapes what gets recommended — the category picks your signals, the
            services decide what&apos;s matchable, the radius scopes the market.
          </p>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel__head">
          <span className="panel__title">Business</span>
          <span className="panel__meta">{user.email}</span>
        </div>
        <BusinessSettingsForm business={business} />
      </section>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel__head">
          <span className="panel__title">Services &amp; prices</span>
          <span className="panel__meta">{services.filter((s) => s.is_active).length} active</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-faint)", margin: "0 0 16px" }}>
          Inactive services stay listed but stop matching signals.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {services.map((s) => (
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
              <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5, flex: "1 1 200px" }}>
                {s.name}
              </span>
              <span className="mono-label">
                {s.price_cents ? `$${Math.round(s.price_cents / 100)}` : "no price"}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <form action={toggleServiceAction}>
                  <input type="hidden" name="service_id" value={s.id} />
                  <input type="hidden" name="active" value={String(!s.is_active)} />
                  <button type="submit" className="btn btn-ghost btn-sm" style={{ padding: "5px 12px", fontSize: 11.5 }}>
                    {s.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteServiceAction}>
                  <input type="hidden" name="service_id" value={s.id} />
                  <button type="submit" className="btn btn-ghost btn-sm" style={{ padding: "5px 12px", fontSize: 11.5, color: "var(--red)" }}>
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
          {services.length === 0 && (
            <p style={{ fontSize: 13.5, color: "var(--ink-faint)", margin: 0 }}>
              No services yet — add what you sell so signals can match.
            </p>
          )}
        </div>
        <form action={addServiceAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            name="name"
            placeholder="New service name"
            aria-label="New service name"
            style={{ flex: "1 1 220px", fontFamily: "var(--body)", fontSize: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "11px 13px", borderRadius: "var(--radius-sm)" }}
          />
          <input
            name="price"
            placeholder="$ price"
            aria-label="New service price"
            style={{ width: 110, fontFamily: "var(--body)", fontSize: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "11px 13px", borderRadius: "var(--radius-sm)" }}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Add service
          </button>
        </form>
      </section>

      <section className="panel" id="documents" style={{ marginBottom: 20 }}>
        <div className="panel__head">
          <span className="panel__title">What TRND knows about you</span>
          <span className="panel__meta">{documents.length} of {MAX_DOCUMENTS} documents</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-faint)", margin: "0 0 16px", maxWidth: 640, lineHeight: 1.55 }}>
          Your menu, a sales export, your brand notes, last quarter&apos;s ad results — anything you know
          that the market doesn&apos;t. TRND reads it once, keeps the facts (never the file), and cites
          them in every read, answer and Monday note from then on.
        </p>
        {documents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {documents.map((d) => {
              const adoptable = newItemsIn(d);
              return (
                <div key={d.id} style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--bg-1)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5, flex: "1 1 200px" }}>{d.name}</span>
                    <span className="badge"><i />{d.digest.kind}</span>
                    <span className="mono-label">{d.digest.facts.length} fact{d.digest.facts.length === 1 ? "" : "s"}</span>
                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className="btn btn-ghost btn-sm">Remove</button>
                    </form>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--ink-soft)" }}>{d.digest.summary}</p>
                  {d.digest.facts.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary className="mono-label" style={{ cursor: "pointer", color: "var(--ink-faint)" }}>What TRND took from it</summary>
                      {d.digest.facts.map((f) => (
                        <p key={f.slice(0, 40)} style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)" }}>· {f}</p>
                      ))}
                    </details>
                  )}
                  {adoptable > 0 && (
                    <form action={adoptDocumentServicesAction} style={{ marginTop: 10 }}>
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Adding…">
                        Add {adoptable} priced item{adoptable === 1 ? "" : "s"} to my services
                      </SubmitButton>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {documents.length < MAX_DOCUMENTS && <DocumentUpload modelReady={isGeminiConfigured} />}
      </section>

      <section className="panel" id="billing" style={{ marginBottom: 20 }}>
        <div className="panel__head">
          <span className="panel__title">Plan &amp; billing</span>
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

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          <span className={`badge${plan.status === "active" ? " badge--mint" : plan.locked ? "" : " badge--mint"}`}>
            <i />
            {plan.plan === "trial"
              ? plan.locked
                ? "trial ended"
                : `trial · ${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} left`
              : plan.status.replace(/_/g, " ")}
          </span>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0, lineHeight: 1.55 }}>
            {plan.plan === "trial"
              ? plan.locked
                ? "Everything you generated stays yours. Pick a plan to keep the weekly recommendations and campaign builds coming."
                : "Full product, no card required. Pick a plan any time — founding businesses lock their price for life."
              : "One ad a week, written before you open the app, your rivals read daily, and the Monday report in your inbox — recorded results sharpen the next one."}
          </p>
        </div>

        {isStripeConfigured ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                  Manage billing →
                </button>
              </form>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: 0, lineHeight: 1.6 }}>
            Payments aren&apos;t set up for this workspace yet. Your trial continues and nothing is locked.
          </p>
        )}
      </section>

      <section className="panel" id="account" style={{ marginBottom: 20 }}>
        <div className="panel__head">
          <span className="panel__title">Account</span>
          <span className="panel__meta">password &amp; data</span>
        </div>
        <AccountPanel email={user.email} />
      </section>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel__head">
          <span className="panel__title">Competitors you watch</span>
          <span className="panel__meta">{competitors.length} tracked · read daily</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-faint)", margin: "0 0 16px" }}>
          Name the local rivals that matter. TRND reads their active Meta ads and Google
          ratings daily — moves show up in your intel report and as alerts.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {competitors.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-1)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5, flex: "1 1 200px" }}>
                {c.name}
              </span>
              <span className="mono-label">{c.place_id ? "listing resolved" : c.website ?? "watching ads"}</span>
              <form action={deleteCompetitorAction}>
                <input type="hidden" name="competitor_id" value={c.id} />
                <button type="submit" className="btn btn-ghost btn-sm" style={{ padding: "5px 12px", fontSize: 11.5, color: "var(--red)" }}>
                  Stop watching
                </button>
              </form>
            </div>
          ))}
          {competitors.length === 0 && (
            <p style={{ fontSize: 13.5, color: "var(--ink-faint)", margin: 0 }}>
              No rivals watched yet — let TRND find the nearest ones, or add the shop your customers compare you against.
            </p>
          )}
        </div>
        {isPlacesConfigured && competitors.length < 5 && (
          <form action={seedCompetitorsAction} style={{ marginBottom: 14 }}>
            <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Finding your rivals…">
              Find my nearest rivals
            </SubmitButton>
            <span className="mono-label" style={{ marginLeft: 10 }}>same category · within 10 miles · chains skipped</span>
          </form>
        )}
        <form action={addCompetitorAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            name="name"
            placeholder="Competitor name (as customers know it)"
            aria-label="Competitor name"
            style={{ flex: "1 1 240px", fontFamily: "var(--body)", fontSize: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "11px 13px", borderRadius: "var(--radius-sm)" }}
          />
          <input
            name="website"
            placeholder="Website (optional)"
            aria-label="Competitor website"
            style={{ width: 200, fontFamily: "var(--body)", fontSize: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "11px 13px", borderRadius: "var(--radius-sm)" }}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Watch competitor
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Data &amp; integrations</span>
          <span className="panel__meta">What powers your recommendations</span>
        </div>
        {connectError && (
          <p style={{ margin: "0 0 14px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--red)" }}>
            {connectError}
          </p>
        )}
        {justConnected && (
          <p style={{ margin: "0 0 14px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--mint-text)" }}>
            Connected. Results will sync from your next launched campaign.
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {integrations.map((it) => (
            <div key={it.name} className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column" }}>
              <span className={`badge${it.ok ? " badge--mint" : " badge--faint"}`} style={{ alignSelf: "flex-start" }}>
                <i />
                {it.ok ? "active" : "not connected"}
              </span>
              <p style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5, margin: "10px 0 3px" }}>{it.name}</p>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", margin: "0 0 8px" }}>{it.detail}</p>
              <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "0 0 10px", lineHeight: 1.5, flex: 1 }}>{it.note}</p>
              {it.action === "connect-meta" && (
                <Link href="/api/connect/meta" className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>
                  Connect Meta →
                </Link>
              )}
              {it.action === "disconnect-meta" && (
                <form action={disconnectMetaAction}>
                  <button type="submit" className="btn btn-ghost btn-sm" style={{ fontSize: 11.5 }}>
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
