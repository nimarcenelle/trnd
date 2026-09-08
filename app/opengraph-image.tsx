import { ImageResponse } from "next/og";

/**
 * The link-preview card, generated at build so it can never drift from the
 * live slogan again (the old static public/og.png shipped a retired one).
 * Colors are the light-theme tokens from globals.css, hard-coded because
 * this renders outside CSS.
 */

export const alt = "TRND — Know what to advertise, before it's obvious";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#f6f4ee";
const INK = "#23201a";
const INK_FAINT = "#6f6759";
const GOLD = "#b57c07";
const MINT = "#1ea7ae";

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
          background: `linear-gradient(160deg, #ffffff 0%, ${BG} 55%, #eeebe1 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ width: 26, height: 26, borderRadius: 999, background: MINT, display: "flex" }} />
          <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: 22, color: INK, display: "flex" }}>
            TRND
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 74, fontWeight: 700, color: INK, lineHeight: 1.15, display: "flex" }}>
            Know what to advertise —
          </div>
          <div style={{ fontSize: 74, fontWeight: 700, color: GOLD, lineHeight: 1.15, display: "flex" }}>
            before it&apos;s obvious.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 28, color: INK_FAINT, display: "flex" }}>
            Live signal → finished campaign, for small businesses.
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
