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

function Para({ label, text, labelColor }: { label: string; text: string; labelColor?: string }) {
  return (
    <div>
      <span className="mono-label" style={{ display: "block", marginBottom: 10, color: labelColor }}>{label}</span>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)", margin: 0 }}>{text}</p>
    </div>
  );
}

/**
 * The founding analysis a business gets when it joins — how TRND reads them:
 * positioning, who buys, the local market, pricing, seasonality, strengths,
 * moat, edges, watchouts, and first moves. Rendered from the stored brief;
 * sections a pre-upgrade brief doesn't have yet are simply omitted.
 */
export default function BusinessBriefCard({
  brief,
  businessName,
}: {
  brief: BusinessBrief;
  businessName: string;
}) {
  const segments = brief.customer_segments ?? [];
  const firstMoves = brief.first_moves ?? [];
  const hasMarketRow =
    segments.length > 0 || brief.market_context || brief.pricing_read || brief.seasonality;

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel__head">
        <span className="panel__title">How TRND reads {businessName}</span>
        <span className="panel__meta">your founding analysis · shapes every recommendation</span>
      </div>

      {brief.positioning ? (
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.65,
            color: "var(--ink)",
            margin: "0 0 22px",
            paddingBottom: 20,
            borderBottom: "1px dashed var(--line)",
            maxWidth: "72ch",
          }}
        >
          {brief.positioning}
        </p>
      ) : null}

      {hasMarketRow ? (
        <div className="brief-grid" style={{ marginBottom: 26 }}>
          {segments.length > 0 && (
            <div>
              <span className="mono-label" style={{ display: "block", marginBottom: 10, color: "var(--amber-text)" }}>Who&apos;s buying</span>
              <List items={segments} />
            </div>
          )}
          {brief.market_context && <Para label="Your local market" text={brief.market_context} />}
          {brief.pricing_read && <Para label="Your pricing, read" text={brief.pricing_read} labelColor="var(--mint-text)" />}
          {brief.seasonality && <Para label="When demand moves" text={brief.seasonality} />}
        </div>
      ) : null}

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

      {firstMoves.length > 0 && (
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px dashed var(--line)" }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 12, color: "var(--amber-text)" }}>Your first moves</span>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {firstMoves.map((move, i) => (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 13, lineHeight: 1.55, color: "var(--ink-soft)" }}>
                <span className="mono-label" style={{ flex: "0 0 auto", marginTop: 2, color: "var(--amber)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ maxWidth: "80ch" }}>{move}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}