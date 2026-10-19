import { ImageResponse } from "next/og";

export const alt = "TRND for creators: know exactly what to post next";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 84px", background: "#1d1724", color: "#f7f5f8" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div style={{ fontSize: 44, fontWeight: 800, display: "flex" }}>
            TRND<span style={{ color: "#ff5c8a" }}>.</span>
          </div>
          <div style={{ fontSize: 28, color: "#aea5b9", display: "flex" }}>for creators</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, display: "flex", maxWidth: 980 }}>Know exactly what to post next.</div>
          <div style={{ fontSize: 30, color: "#aea5b9", display: "flex" }}>Your next three TikToks: hook, script, sound and hashtags.</div>
        </div>
        <div style={{ fontSize: 24, color: "#ff5c8a", display: "flex" }}>#studytok · #collegeapps · #booktok</div>
      </div>
    ),
    size,
  );
}
