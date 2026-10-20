import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { avatarTone } from "@/components/app/avatar";
import { hookScale, type NextTikTok } from "@/lib/preview/next-tiktok";

/** The "Your next TikTok" frame as a 1080×1920 PNG, to save and share. Same frame as components/app/next-tiktok.tsx, drawn for Satori. */
const W = 1080;
const H = 1920;
/** 1% of the frame's width, the unit the on-page frame is drawn in (cqw). */
const U = W / 100;

// Satori can't read CSS variables: the tokens from app/globals.css this card uses, by value.
const C = { night: "#1d1724", onNight: "#f7f5f8", tag: "#99ccd6", chip: "rgba(247, 245, 248, 0.15)", faint: "rgba(247, 245, 248, 0.6)" };

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const [figtree500, figtree700, unbounded600] = await Promise.all([font("figtree-latin-500-normal.woff"), font("figtree-latin-700-normal.woff"), font("unbounded-latin-600-normal.woff")]);

const icon = { width: 8 * U, height: 8 * U };

export function nextTikTokCard(t: NextTikTok): ImageResponse {
  const tone = avatarTone(t.handle);
  const avatar = 12 * U;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.night, color: C.onNight, fontFamily: "Figtree", fontWeight: 500 }}>
        <div style={{ position: "absolute", left: 4.5 * U, top: 4.5 * U, display: "flex", borderRadius: 999, background: C.chip, padding: `${1.2 * U}px ${3 * U}px`, fontSize: 3.6 * U, fontWeight: 700 }}>Not posted yet</div>

        <div style={{ position: "absolute", left: 6 * U, right: 6 * U, top: H * 0.14, bottom: H * 0.5, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", background: C.onNight, color: C.night, borderRadius: 1.4 * U, padding: `${1.6 * U}px ${2.6 * U}px`, fontFamily: "Unbounded", fontWeight: 600, fontSize: hookScale(t.hook) * W, lineHeight: 1.25, letterSpacing: "-0.01em", textAlign: "center" }}>{t.hook}</div>
        </div>

        <div style={{ position: "absolute", right: 3.5 * U, bottom: 24 * U, display: "flex", flexDirection: "column", alignItems: "center", gap: 4.5 * U }}>
          <div style={{ width: avatar, height: avatar, borderRadius: 999, border: `${0.5 * U}px solid ${C.onNight}`, background: tone.background, color: tone.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: avatar * 0.42, fontWeight: 700 }}>{tone.letter}</div>
          <svg viewBox="0 0 24 24" fill={C.onNight} {...icon}>
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21Z" />
          </svg>
          <svg viewBox="0 0 24 24" fill={C.onNight} {...icon}>
            <path d="M12 3.5c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4.5 20.5l1.2-3.9C4 15.2 3 13.3 3 11.2 3 6.9 7 3.5 12 3.5Z" />
          </svg>
          <svg viewBox="0 0 24 24" fill={C.onNight} {...icon}>
            <path d="M13.5 4.5 21.5 12l-8 7.5v-4.3c-5 0-8.3 1.4-10.5 4.8.6-5.6 3.6-10 10.5-10.8V4.5Z" />
          </svg>
        </div>

        <div style={{ position: "absolute", left: 4.5 * U, right: 18 * U, bottom: 9 * U, display: "flex", flexDirection: "column", gap: 1.6 * U, fontSize: 3.9 * U, lineHeight: 1.35 }}>
          <div style={{ display: "flex", fontSize: 4.3 * U, fontWeight: 700 }}>@{t.handle}</div>
          {t.caption && <div style={{ display: "block", lineClamp: 2 }}>{t.caption}</div>}
          {t.hashtags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", columnGap: 1.6 * U, color: C.tag, fontWeight: 700 }}>{t.hashtags.map((h) => <span key={h}>{h}</span>)}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 1.6 * U }}>
            <svg viewBox="0 0 16 16" fill={C.onNight} width={3.6 * U} height={3.6 * U}>
              <path d="M6 2.5 14 1v9.5a2.3 2.3 0 1 1-1.5-2.1V4.2L7.5 5.1v7.4A2.3 2.3 0 1 1 6 10.4V2.5Z" />
            </svg>
            <div style={{ display: "block", lineClamp: 1 }}>{t.sound}</div>
          </div>
        </div>

        <div style={{ position: "absolute", right: 4.5 * U, bottom: 3.2 * U, display: "flex", fontSize: 2.6 * U, color: C.faint }}>creators.usetrnd.com</div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Figtree", data: figtree500, weight: 500, style: "normal" },
        { name: "Figtree", data: figtree700, weight: 700, style: "normal" },
        { name: "Unbounded", data: unbounded600, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=300" },
    },
  );
}
