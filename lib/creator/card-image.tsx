import type { CreatorStats } from "./stats";
import { killerFromNumbers, stuckCount, theirs } from "./stats";

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
  /** What's killing the posts, from the written read, in the creator's voice ("your"). */
  killer?: string | null;
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(n)));
const mine = (line: string) =>
  line.replace(/\byou're\b/g, "I'm").replace(/\bYou're\b/g, "I'm").replace(/\byour\b/g, "my").replace(/\bYour\b/g, "My").replace(/\byou\b/g, "I").replace(/\bYou\b/g, "I");

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
  const killer = mine(d.killer || killerFromNumbers(s));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.stage, color: C.ink, padding: "130px 96px 120px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Mark size={32} />
        <div style={{ display: "flex", fontSize: 30, color: C.ink2 }}>
          @{d.handle}
          {d.followers ? ` · ${compact(d.followers)}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 260, fontWeight: 700, lineHeight: 1, letterSpacing: -12, marginTop: 170 }}>
        {stuckCount(s)}
        <span style={{ color: C.ink2 }}>/{s.posts.length}</span>
      </div>
      <div style={{ display: "flex", fontSize: 52, fontWeight: 600, lineHeight: 1.25, marginTop: 24 }}>of my posts never got past my followers</div>
      <div style={{ display: "flex", marginTop: 80 }}>
        <Tiles s={s} size={62} gap={11} />
      </div>
      <div style={{ display: "flex", gap: 36, marginTop: 24, fontSize: 30, color: C.ink2 }}>
        <div style={{ display: "flex" }}>{s.breakouts} broke out</div>
        <div style={{ display: "flex" }}>{s.posts.length - s.breakouts - s.stalled} stuck</div>
        <div style={{ display: "flex" }}>{s.stalled} flopped</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", background: C.raise, borderRadius: 32, padding: "40px 44px", marginTop: 80 }}>
        <div style={{ display: "flex", fontSize: 30, color: C.neg }}>What was killing them</div>
        <div style={{ display: "flex", fontSize: 50, fontWeight: 700, lineHeight: 1.25, marginTop: 16 }}>{killer.slice(0, 130)}</div>
      </div>
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${C.line}`, paddingTop: 40 }}>
        <div style={{ display: "flex", fontSize: 34, color: C.ink2 }}>Why do yours flop?</div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>usetrnd.com/creators</div>
      </div>
    </div>
  );
}

export function PreviewImage({ d }: { d: CardInput }) {
  const s = d.stats;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.stage, color: C.ink, padding: "60px 72px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Mark size={26} />
        <div style={{ display: "flex", fontSize: 26, color: C.ink2 }}>@{d.handle}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 70 }}>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>
          {stuckCount(s)}
          <span style={{ color: C.ink2 }}>/{s.posts.length}</span>
        </div>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 600, lineHeight: 1.2, paddingBottom: 14, maxWidth: 560 }}>posts never got past their followers</div>
      </div>
      <div style={{ display: "flex", fontSize: 30, color: C.ink2, marginTop: 28, maxWidth: 1000 }}>{theirs(d.killer || killerFromNumbers(s)).slice(0, 110)}</div>
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Tiles s={s} size={36} gap={8} />
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>Why do yours flop? usetrnd.com/creators</div>
      </div>
    </div>
  );
}
