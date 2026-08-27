import Link from "next/link";
import { redirect } from "next/navigation";

import BusinessSettingsForm from "@/components/app/business-settings-form";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import {
  isDataForSeoConfigured,
  isEmailConfigured,
  isGeminiConfigured,
  isMetaAdsConfigured,
  isPlacesConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { addCompetitorAction, deleteCompetitorAction, disconnectMetaAction } from "@/lib/intel/actions";
import {
  addServiceAction,
  deleteServiceAction,
  toggleServiceAction,
} from "@/lib/settings/actions";

export const metadata = { title: "Settings — TRND" };

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const params = await searchParams;
  const connectError = typeof params.connect_error === "string" ? params.connect_error : null;
  const justConnected = typeof params.connected === "string" ? params.connected : null;
  const [services, competitors, metaConnection, gbpConnection] = await Promise.all([
    repo.listServices(business.id),
    repo.listCompetitors(business.id),
    repo.getConnection(business.id, "meta"),
    repo.getConnection(business.id, "google_business"),
  ]);

  const metaConnected = metaConnection?.status === "connected";
  const integrations = [
    {
      name: "Meta ad account",
      detail: metaConnected
        ? `${metaConnection?.account_name ?? metaConnection?.account_id ?? "Connected"}`
        : isMetaAdsConfigured
          ? "Ready to connect"
          : "Awaiting platform credentials",
      ok: metaConnected,
      note: metaConnected
        ? "Launched campaigns sync results back automatically, daily."
        : isMetaAdsConfigured
          ? "Connect to launch campaigns (paused) and auto-sync results."
          : "Needs META_APP_ID / META_APP_SECRET — results stay manual entry until then.",
      action: metaConnected ? ("disconnect-meta" as const) : isMetaAdsConfigured ? ("connect-meta" as const) : null,
    },
    {
      name: "Reviews & ratings",
      detail: gbpConnection
        ? `Google · ${gbpConnection.account_name ?? "resolved"}`
        : isPlacesConfigured
          ? "Resolving your listing…"
          : "Awaiting Places API key",
      ok: Boolean(gbpConnection),
      note: isPlacesConfigured
        ? "Your reviews and competitors' ratings are read daily."
        : "Needs GOOGLE_PLACES_API_KEY — unlocks voice-of-customer mining and competitor ratings.",
      action: null,
    },
    {
      name: "Search-volume backbone",
      detail: isDataForSeoConfigured ? "DataForSEO — active" : "Awaiting credentials",
      ok: isDataForSeoConfigured,
      note: isDataForSeoConfigured
        ? "Real monthly volumes for every watch term, read daily."
        : "Needs DATAFORSEO_LOGIN / PASSWORD — watch terms ride news + ad reads until then.",
      action: null,
    },
    {
      name: "Weekly email",
      detail: isEmailConfigured ? "Resend — active" : "Awaiting RESEND_API_KEY",
      ok: isEmailConfigured,
      note: isEmailConfigured
        ? "The Monday intel report lands in your inbox."
        : "The report still generates in-app every week.",
      action: null,
    },
    {
      name: "Campaign generation",
      detail: isGeminiConfigured ? "Gemini — connected" : "Template generator",
      ok: isGeminiConfigured,
      note: isGeminiConfigured
        ? "Structured output, validated before it reaches you."
        : "Add GEMINI_API_KEY to unlock model-written campaigns.",
      action: null,
    },
    {
      name: "Database & auth",
      detail: isSupabaseConfigured ? "Supabase — connected" : "Local demo store",
      ok: isSupabaseConfigured,
      note: isSupabaseConfigured
        ? "Rows protected per-business by RLS."
        : "Add Supabase keys to .env.local to go multi-device.",
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
              No competitors named yet — add the shop your customers compare you against.
            </p>
          )}
        </div>
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
          <span className="panel__meta">what powers your recommendations</span>
        </div>
        {connectError && (
          <p style={{ margin: "0 0 14px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--red)" }}>
            {connectError}
          </p>
        )}
        {justConnected && (
          <p style={{ margin: "0 0 14px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--mint-text)" }}>
            Connected — results will sync from your next launched campaign.
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
