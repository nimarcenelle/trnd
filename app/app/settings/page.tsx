import { redirect } from "next/navigation";

import BusinessSettingsForm from "@/components/app/business-settings-form";
import { getSessionUser } from "@/lib/auth/session";
import { getPlanState, PLAN_LABELS, PLAN_PRICES } from "@/lib/billing";
import { openBillingPortalAction, startCheckoutAction } from "@/lib/billing/actions";
import { getUserRepo } from "@/lib/db";
import { isGeminiConfigured, isStripeConfigured, isSupabaseConfigured } from "@/lib/env";
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
    text: "Billing isn't connected yet — add the STRIPE_* keys in .env.local and this panel goes live.",
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
  const services = await repo.listServices(business.id);
  const plan = await getPlanState(repo, business);
  const billingFlag = String((await searchParams).billing ?? "");
  const billingNotice = BILLING_NOTICES[billingFlag] ?? null;

  const integrations = [
    {
      name: "Database & auth",
      detail: isSupabaseConfigured ? "Supabase — connected" : "Local demo store",
      ok: isSupabaseConfigured,
      note: isSupabaseConfigured
        ? "Rows protected per-business by RLS."
        : "Add Supabase keys to .env.local to go multi-device.",
    },
    {
      name: "Campaign generation",
      detail: isGeminiConfigured ? "Gemini — connected" : "Template generator",
      ok: isGeminiConfigured,
      note: isGeminiConfigured
        ? "Structured output, validated before it reaches you."
        : "Add GEMINI_API_KEY to unlock model-written campaigns.",
    },
    {
      name: "Signal sources",
      detail: "Google Trends · Reddit · Google News",
      ok: true,
      note: "Refreshed daily by the ingest job. YouTube optional via API key.",
    },
    {
      name: "Payments",
      detail: isStripeConfigured ? "Stripe — connected" : "Stripe — not connected",
      ok: isStripeConfigured,
      note: isStripeConfigured
        ? "Checkout, upgrades, and the billing portal are live."
        : "Add STRIPE_* keys to .env.local to start charging.",
    },
    {
      name: "Ad account sync",
      detail: "Meta Marketing API — planned",
      ok: false,
      note: "Results are manual entry today; the schema is sync-ready.",
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
              : plan.plan === "pro"
                ? "Everything in TRND plus connected-account sync as it rolls out."
                : "A finished, scored campaign every week — recorded results sharpen the next one."}
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
            {plan.plan !== "pro" && (
              <form action={startCheckoutAction}>
                <input type="hidden" name="plan" value="pro" />
                <button type="submit" className={`btn btn-sm ${plan.plan === "baseline" ? "btn-primary" : "btn-ghost"}`}>
                  {plan.plan === "baseline" ? "Upgrade to Pro" : "Start Pro"} — {PLAN_PRICES.pro}
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
            Payments aren&apos;t connected in this install. Add <code style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>STRIPE_SECRET_KEY</code>,{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>STRIPE_WEBHOOK_SECRET</code>, and the two{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>STRIPE_PRICE_*</code> ids to .env.local and
            this panel starts selling — checkout, upgrades, and the customer portal included.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Data &amp; integrations</span>
          <span className="panel__meta">what powers your recommendations</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {integrations.map((it) => (
            <div key={it.name} className="card" style={{ padding: "16px 18px" }}>
              <span className={`badge${it.ok ? " badge--mint" : " badge--faint"}`}>
                <i />
                {it.ok ? "active" : "not connected"}
              </span>
              <p style={{ fontFamily: "var(--disp)", fontWeight: 600, fontSize: 14.5, margin: "10px 0 3px" }}>{it.name}</p>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", margin: "0 0 8px" }}>{it.detail}</p>
              <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: 0, lineHeight: 1.5 }}>{it.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
