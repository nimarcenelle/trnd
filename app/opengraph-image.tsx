import { ImageResponse } from "next/og";

/**
 * The link-preview card, generated at build so it can never drift from the
 * live slogan again (the old static public/og.png shipped a retired one).
 * Colors are the dark-theme tokens from globals.css, hard-coded because
 * this renders outside CSS.
 */

export const alt = "TRND: Ad intelligence. Always-on surveillance for paid ads.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0d0b09";
const INK = "#f3eee6";
const INK_FAINT = "#8a8176";
const GOLD = "#62d6c1";
const MINT = "#62d6c1";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          background: `linear-gradient(160deg, #1c1916 0%, ${BG} 60%, #0a0908 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* The dot is the recording light. */}
          <div style={{ width: 26, height: 26, borderRadius: 999, background: MINT, boxShadow: `0 0 0 10px ${MINT}33`, display: "flex" }} />
          <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: 22, color: INK, display: "flex" }}>
            TRND
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 74, fontWeight: 700, color: INK, lineHeight: 1.15, display: "flex" }}>
            Cheat off your competitors.
          </div>
          <div style={{ fontSize: 58, fontWeight: 400, color: GOLD, lineHeight: 1.2, display: "flex" }}>
            Always-on surveillance for paid ads.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 28, color: INK_FAINT, display: "flex" }}>
            Ad intelligence.
          </div>
          <div style={{ fontSize: 28, color: INK_FAINT, letterSpacing: 2, display: "flex" }}>
            usetrnd.com
          </div>
        </div>
      </div>
    ),
    size,
  );
}
