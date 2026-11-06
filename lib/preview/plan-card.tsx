import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { onScreenHook } from "@/lib/preview/next-tiktok";

/**
 * "My next 3 posts, planned by TRND": the week's three hooks as a 1080×1920
 * image to post or send, with the creator's referral link on it. Drawn for
 * Satori, so the tokens are by value (app/globals.css: --night, --brand).
 */
const C = { night: "#141413", raise: "#1f1f1d", ink: "#f6f6f4", ink2: "#a8a8a3", brand: "#4fd1bb", line: "rgba(255,255,255,0.12)" };

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const [inter500, inter700] = await Promise.all([font("inter-latin-500-normal.woff"), font("inter-latin-700-normal.woff")]);

export function planCard(p: { handle: string; hooks: string[]; link: string }): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.night, color: C.ink, fontFamily: "Inter", padding: "120px 90px 110px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", width: 18, height: 18, borderRadius: 999, background: C.brand }} />
          <div style={{ display: "flex", fontSize: 36, fontWeight: 500, letterSpacing: 11 }}>TRND</div>
          <div style={{ display: "flex", fontSize: 32, color: C.ink2, marginLeft: 8 }}>@{p.handle}</div>
        </div>
        <div style={{ display: "flex", fontSize: 104, fontWeight: 700, lineHeight: 1.02, letterSpacing: -4, marginTop: 150 }}>My next 3 posts</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 70 }}>
          {p.hooks.slice(0, 3).map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 30, alignItems: "flex-start", background: C.raise, borderRadius: 30, padding: "40px 44px" }}>
              <div style={{ display: "flex", width: 64, height: 64, borderRadius: 999, background: C.brand, color: C.night, fontSize: 34, fontWeight: 700, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700, lineHeight: 1.22 }}>{onScreenHook(h).slice(0, 110)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `2px solid ${C.line}`, paddingTop: 40 }}>
          <div style={{ display: "flex", fontSize: 34, color: C.ink2 }}>Planned by TRND, from what&apos;s working in my niche</div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{p.link.replace(/^https?:\/\//, "")}</div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: [
        { name: "Inter", data: inter500, weight: 500, style: "normal" },
        { name: "Inter", data: inter700, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "private, max-age=300" },
    },
  );
}
