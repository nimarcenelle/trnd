import { redirect } from "next/navigation";

import BusinessSettingsForm from "@/components/app/business-settings-form";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";
import {
  addServiceAction,
  deleteServiceAction,
  toggleServiceAction,
} from "@/lib/settings/actions";

export const metadata = { title: "Settings — TRND" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const services = await repo.listServices(business.id);

  return (
    <div className="wrap" style={{ padding: "44px 32px 72px", maxWidth: 860 }}>
      <span className="eyebrow">Settings</span>
      <h1 className="h-disp" style={{ fontSize: 28, margin: "0 0 6px" }}>
        Your business profile.
      </h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: 540, lineHeight: 1.6, margin: "0 0 30px" }}>
        Everything here shapes what gets recommended — the category picks your signals, the
        services decide what&apos;s matchable, the radius scopes the market. Theme lives in the
        toggle up top.
      </p>

      <section className="card-lg" style={{ padding: "28px 30px", marginBottom: 26 }}>
        <h2 className="mono-label" style={{ marginBottom: 18 }}>
          Business
        </h2>
        <BusinessSettingsForm business={business} />
      </section>

      <section className="card-lg" style={{ padding: "28px 30px" }}>
        <h2 className="mono-label" style={{ marginBottom: 6 }}>
          Services &amp; prices
        </h2>
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
    </div>
  );
}
