import type { CreatorStats } from "./stats";
import { creatorType } from "./types";

/**
 * The type card drawn for next/og: the story image (1080x1920, posted by the
 * creator, so it speaks as them) and the link preview (1200x630, seen by
 * others). The stage tokens hard-coded, since this renders outside CSS.
 */
const C = { stage: "#141413", raise: "#1f1f1d", ink: "#f6f6f4", ink2: "#a8a8a3", line: "rgba(255,255,255,0.12)", brand: "#4fd1bb", pos: "#47cd89", neg: "#f97066", usual: "rgba(255,255,255,0.2)" };
const tile = (t: string) => (t === "breakout" ? C.pos : t === "stalled" ? C.neg : C.usual);

export interface CardInput {
  handle: string;
  platform: string;
  followers?: number | null;
  stats: CreatorStats;
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(n)));
const myLine = (line: string) => line.replace(/\byour\b/g, "my").replace(/\bYour\b/g, "My");
const theirs = (line: string) => line.replace(/\byour\b/g, "their").replace(/\bYour\b/g, "Their");
const best = (s: CreatorStats) => s.posts.reduce((b, p) => (p.multiple > b.multiple ? p : b), s.posts[0]);

function Mark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.45 }}>
      <div style={{ display: "flex", width: size * 0.46, height: size * 0.46, borderRadius: 999, background: C.brand }} />
      <div style={{ display: "flex", fontSize: size, fontWeight: 500, letterSpacing: size * 0.3, color: C.ink }}>TRND</div>
    </div>
  );
}

function Tiles({ s, size, gap }: { s: CreatorStats; size: number; gap: number }) {
  return (
    <div style={{ display: "flex", gap }}>
      {[...s.posts].reverse().map((p, i) => (
        <div key={i} style={{ display: "flex", width: size, height: size, borderRadius: size * 0.24, background: tile(p.tier) }} />
      ))}
    </div>
  );
}

export function StoryImage({ d }: { d: CardInput }) {
  const s = d.stats;
  const type = creatorType(s);
  const b = best(s);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.stage, color: C.ink, padding: "130px 96px 120px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Mark size={32} />
        <div style={{ display: "flex", fontSize: 30, color: C.ink2 }}>
          @{d.handle}
          {d.followers ? ` · ${compact(d.followers)}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 40, color: C.ink2, marginTop: 190 }}>My posting type</div>
      <div style={{ display: "flex", fontSize: 128, fontWeight: 700, lineHeight: 1, letterSpacing: -5, marginTop: 22 }}>{type.name}</div>
      <div style={{ display: "flex", fontSize: 42, lineHeight: 1.35, color: C.ink2, marginTop: 40 }}>{myLine(type.line)}</div>
      <div style={{ display: "flex", marginTop: 90 }}>
        <Tiles s={s} size={62} gap={11} />
      </div>
      <div style={{ display: "flex", gap: 36, marginTop: 24, fontSize: 30, color: C.ink2 }}>
        <div style={{ display: "flex" }}>{s.breakouts} broke out</div>
        <div style={{ display: "flex" }}>{s.stalled} stalled</div>
        <div style={{ display: "flex" }}>last {s.posts.length} posts</div>
      </div>
      {b ? (
        <div style={{ display: "flex", flexDirection: "column", background: C.raise, borderRadius: 32, padding: "40px 44px", marginTop: 80 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 30, color: C.ink2 }}>My best post</div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, background: C.pos, color: C.stage, borderRadius: 999, padding: "6px 22px" }}>{b.multiple}× usual</div>
          </div>
          <div style={{ display: "flex", fontSize: 48, fontWeight: 700, lineHeight: 1.25, marginTop: 20 }}>&ldquo;{(b.caption ?? "No caption").slice(0, 90)}&rdquo;</div>
        </div>
      ) : (
        <div style={{ display: "flex" }} />
      )}
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${C.line}`, paddingTop: 40 }}>
        <div style={{ display: "flex", fontSize: 34, color: C.ink2 }}>Find your type</div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>usetrnd.com/creators</div>
      </div>
    </div>
  );
}

export function PreviewImage({ d }: { d: CardInput }) {
  const s = d.stats;
  const type = creatorType(s);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.stage, color: C.ink, padding: "60px 72px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Mark size={26} />
        <div style={{ display: "flex", fontSize: 26, color: C.ink2 }}>@{d.handle}&apos;s posting type</div>
      </div>
      <div style={{ display: "flex", fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1, marginTop: 90 }}>{type.name}</div>
      <div style={{ display: "flex", fontSize: 30, color: C.ink2, marginTop: 24, maxWidth: 980 }}>{theirs(type.line)}</div>
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Tiles s={s} size={36} gap={8} />
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>What&apos;s yours? usetrnd.com/creators</div>
      </div>
    </div>
  );
}
