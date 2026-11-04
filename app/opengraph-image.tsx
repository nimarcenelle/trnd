import { ImageResponse } from "next/og";

/** The link-preview card, from the light theme's tokens (hard-coded: this renders outside CSS). */

export const alt = "Admitted: your real admit odds, and the part you can still move";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 84px", background: "#f7f5f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: "#3d6b4f", display: "flex" }} />
          <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: -1, color: "#111110", display: "flex" }}>Admitted</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#111110", lineHeight: 1.06, letterSpacing: -2, display: "flex", flexDirection: "column" }}>
            <span>Your real odds.</span>
            <span>And the part you can still move.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, color: "#4f4d47" }}>
            <div style={{ display: "flex", width: 360, height: 14, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: "64%", background: "#2b2a27", display: "flex" }} />
              <div style={{ width: "36%", background: "#3d6b4f", marginLeft: 3, display: "flex" }} />
            </div>
            <span>64% locked · 36% movable</span>
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#85827a", display: "flex" }}>admitted.usetrnd.com</div>
      </div>
    ),
    size,
  );
}
