import type { CreatorStats } from "./stats";

/**
 * The result drawn for next/og: the story image (1080x1920, for TikTok photo
 * mode and Instagram stories) and the link preview (1200x630). Light theme
 * tokens hard-coded, since this renders outside CSS.
 */
const C = { bg: "#ffffff", subtle: "#fafaf9", line: "#d6d6d2", ink: "#111110", ink2: "#51514d", ink3: "#868680", brand: "#0f8a78", pos: "#067647", neg: "#b42318", usual: "#cfcfcb" };
const fill = (t: string) => (t === "breakout" ? C.pos : t === "stalled" ? C.neg : C.usual);

export interface CardInput {
  handle: string;
  platform: string;
  followers?: number | null;
  stats: CreatorStats;
  verdict?: string | null;
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(n)));

function Bars({ stats, width, height, bar }: { stats: CreatorStats; width: number; height: number; bar: number }) {
  const posts = [...stats.posts].reverse();
  const max = Math.max(stats.bestMultiple * 1.12, 2.6);
  const h = (m: number) => Math.max(4, Math.round((Math.min(m, max) / max) * height));
  return (
    <div style={{ display: "flex", position: "relative", width, height, borderBottom: `2px solid ${C.line}` }}>
      {[1, 2].map((m) => (
        <div key={m} style={{ position: "absolute", left: 0, right: 0, bottom: h(m), borderTop: `2px solid ${C.line}`, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", marginTop: -bar * 0.36, paddingLeft: bar * 0.25, background: C.bg, fontSize: bar * 0.5, lineHeight: 1, color: C.ink3 }}>{m === 1 ? "usual" : "2×"}</div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", width: width - bar * 2, height: "100%" }}>
        {posts.map((p, i) => (
          <div key={i} style={{ display: "flex", width: bar, height: h(p.multiple), background: fill(p.tier), borderTopLeftRadius: bar / 5, borderTopRightRadius: bar / 5 }} />
        ))}
      </div>
    </div>
  );
}

function Mark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.45 }}>
      <div style={{ display: "flex", width: size * 0.46, height: size * 0.46, borderRadius: 999, background: C.brand }} />
      <div style={{ display: "flex", fontSize: size, fontWeight: 500, letterSpacing: size * 0.3, color: C.ink }}>TRND</div>
    </div>
  );
}

export function StoryImage({ d }: { d: CardInput }) {
  const s = d.stats;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: "120px 90px 110px", fontFamily: "sans-serif" }}>
      <Mark size={34} />
      <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 120 }}>
        <div style={{ display: "flex", width: 104, height: 104, borderRadius: 999, background: C.ink, color: C.bg, fontSize: 48, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>
          {d.handle.charAt(0).toUpperCase()}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 50, fontWeight: 700, color: C.ink }}>@{d.handle}</div>
          <div style={{ display: "flex", fontSize: 32, color: C.ink3, marginTop: 6 }}>
            {d.platform === "tiktok" ? "TikTok" : "Instagram"}
            {d.followers ? ` · ${compact(d.followers)} followers` : ""}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 34, color: C.ink3, marginTop: 110 }}>Last {s.posts.length} posts</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 30, marginTop: 8 }}>
        <div style={{ display: "flex", fontSize: 230, fontWeight: 700, lineHeight: 1, letterSpacing: -10, color: C.ink }}>
          {s.breakouts}
          <span style={{ color: C.ink3 }}>/{s.posts.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", paddingBottom: 28 }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 600, color: C.ink }}>broke out</div>
          <div style={{ display: "flex", fontSize: 34, color: C.ink3, marginTop: 6 }}>best at {s.bestMultiple}× usual</div>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 110 }}>
        <Bars stats={s} width={900} height={420} bar={44} />
      </div>
      <div style={{ display: "flex", gap: 40, marginTop: 34, fontSize: 30, color: C.ink2 }}>
        {[
          ["Broke out", C.pos],
          ["Usual", C.usual],
          ["Stalled", C.neg],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", width: 24, height: 24, borderRadius: 6, background: c }} />
            {l}
          </div>
        ))}
      </div>
      {d.verdict ? <div style={{ display: "flex", fontSize: 44, lineHeight: 1.3, fontWeight: 600, color: C.ink, marginTop: 90 }}>{d.verdict.slice(0, 150)}</div> : <div style={{ display: "flex" }} />}
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${C.line}`, paddingTop: 40 }}>
        <div style={{ display: "flex", fontSize: 34, color: C.ink2 }}>Check yours free</div>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: C.ink }}>usetrnd.com/creators</div>
      </div>
    </div>
  );
}

export function PreviewImage({ d }: { d: CardInput }) {
  const s = d.stats;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: C.bg, padding: "64px 72px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
        <Mark size={26} />
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: C.ink, marginTop: 64 }}>@{d.handle}</div>
        <div style={{ display: "flex", fontSize: 26, color: C.ink3, marginTop: 6 }}>Last {s.posts.length} posts</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginTop: 20 }}>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: -6, color: C.ink }}>
            {s.breakouts}
            <span style={{ color: C.ink3 }}>/{s.posts.length}</span>
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: C.ink, paddingBottom: 16 }}>broke out</div>
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", fontSize: 26, color: C.ink2 }}>Check yours free · usetrnd.com/creators</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", marginLeft: 40 }}>
        <Bars stats={s} width={500} height={400} bar={26} />
      </div>
    </div>
  );
}
