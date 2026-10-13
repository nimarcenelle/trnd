import { ImageResponse } from "next/og";

/** The link-preview card, generated at build from the light theme's tokens (hard-coded: this renders outside CSS). */

export const alt = "TRND: Competitor ad intelligence for Meta";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 84px", background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: "#0f8a78", display: "flex" }} />
          <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: 14, color: "#111110", display: "flex" }}>TRND</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#111110", lineHeight: 1.08, letterSpacing: -2, display: "flex", maxWidth: 980 }}>
            See every ad your competitors run, and what&apos;s working.
          </div>
          <div style={{ fontSize: 30, color: "#51514d", display: "flex" }}>Competitor ad tracking for Facebook and Instagram.</div>
        </div>
        <div style={{ fontSize: 24, color: "#868680", display: "flex" }}>usetrnd.com</div>
      </div>
    ),
    size,
  );
}
