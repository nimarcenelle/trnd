import type { BusinessBrief } from "@/lib/db/types";

function List({ items, tone }: { items: string[]; tone?: "warn" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, lineHeight: 1.55, color: "var(--ink-soft)" }}>
          {tone === "warn" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" style={{ flex: "0 0 auto", marginTop: 3 }} aria-hidden="true">
              <path d="M4 4L12 12M12 4L4 12" stroke="var(--ink-faint)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" style={{ flex: "0 0 auto", marginTop: 3 }} aria-hidden="true">
              <path d="M3 8.5L6.5 12L13 4" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          )}
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The positioning card a business gets after joining — how TRND reads them.
 * Rendered from the stored brief (generated at onboarding).
 */
export default function BusinessBriefCard({
  brief,
  businessName,
}: {
  brief: BusinessBrief;
  businessName: string;
}) {
  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel__head">
        <span className="panel__title">How TRND reads {businessName}</span>
        <span className="panel__meta">generated when you joined · shapes every recommendation</span>
      </div>
      <div className="brief-grid">
        <div>
          <span className="mono-label" style={{ display: "block", marginBottom: 10 }}>What you do well</span>
          <List items={brief.does_well} />
        </div>
        <div>
          <span className="mono-label" style={{ display: "block", marginBottom: 10, color: "var(--mint-text)" }}>Your moat</span>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)", margin: 0 }}>{brief.moat}</p>
        </div>
        <div>
          <span className="mono-label" style={{ display: "block", marginBottom: 10, color: "var(--amber-text)" }}>Edges to press in ads</span>
          <List items={brief.advantages} />
        </div>
        <div>
          <span className="mono-label" style={{ display: "block", marginBottom: 10 }}>Avoid in your ads</span>
          <List items={brief.watchouts} tone="warn" />
        </div>
      </div>
    </section>
  );
}
