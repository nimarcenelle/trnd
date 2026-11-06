"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CreatorStats, ScoredPost } from "@/lib/creator/stats";
import { compact } from "@/lib/format";

import { creatorType } from "@/lib/creator/types";

import TypeCard from "./type-card";
import { CountUp, Initial, PostBars, TIER_LABEL, TierLegend } from "./visuals";

/**
 * A teardown played as a 9:16 video: the hook, one scene per beat, the call
 * to check yours. Screen-record the frame (phone or OBS) and post it: the
 * numbers count up, the bars grow, the captions run in time with the
 * voiceover. Keys: space plays and pauses, arrows step, R restarts, C hides
 * the captions, F goes full screen.
 */

type Visual = "hook" | "intro" | "type" | "chart" | "post" | "compare" | "text" | "cta";
interface Beat {
  say: string;
  show: string;
  visual?: Visual;
  post?: number | null;
  overlay?: string;
}
export interface PlayerTeardown {
  id: string;
  handle: string;
  platform: string;
  followers?: number | null;
  stats: CreatorStats;
  script: { hook: string; beats: Beat[]; cta: string };
}

interface Scene {
  visual: Visual;
  overlay: string;
  say: string;
  post: ScoredPost | null;
  postIndex: number | null;
  ms: number;
}

const W = 540;
const H = 960;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** Roughly a voiceover's pace: 2.7 words a second, plus a beat to land. */
const duration = (say: string, min = 2600) => Math.max(min, (words(say) / 2.7) * 1000 + 700);

function buildScenes(t: PlayerTeardown): Scene[] {
  const posts = t.stats.posts;
  const best = posts.reduce((b, p, i) => (p.multiple > posts[b].multiple ? i : b), 0);
  const scenes: Scene[] = [{ visual: "hook", overlay: t.script.hook, say: t.script.hook, post: null, postIndex: null, ms: duration(t.script.hook, 2400) }];
  t.script.beats.forEach((b, i) => {
    // Scripts written before the player had no visuals: the first two beats introduce, the rest are text.
    const visual: Visual = b.visual ?? (i === 0 ? "intro" : i === 1 ? "chart" : "text");
    const idx = visual === "post" ? (b.post && b.post >= 1 && b.post <= posts.length ? b.post - 1 : best) : null;
    scenes.push({ visual, overlay: b.overlay ?? "", say: b.say, post: idx !== null ? posts[idx] : null, postIndex: idx, ms: duration(b.say) });
  });
  // The reveal: their type, right after the introduction (or after the hook when there is none).
  const type = creatorType(t.stats);
  const at = scenes.findIndex((x) => x.visual === "intro");
  const reveal = `@${t.handle} is ${type.name}.`;
  scenes.splice(at >= 0 ? at + 1 : 1, 0, { visual: "type", overlay: "", say: reveal, post: null, postIndex: null, ms: 4200 });
  scenes.push({ visual: "cta", overlay: "Check yours free", say: t.script.cta, post: null, postIndex: null, ms: duration(t.script.cta, 3800) });
  return scenes;
}

/** Captions in short chunks, timed across the scene, as a viewer with the sound off reads them. */
function chunks(say: string): string[] {
  const w = say.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < w.length; i += 6) out.push(w.slice(i, i + 6).join(" "));
  return out.length ? out : [""];
}

function SceneView({ s, t, run }: { s: Scene; t: PlayerTeardown; run: number }) {
  const posts = t.stats.posts;
  if (s.visual === "hook" || s.visual === "text") {
    return (
      <div className="flex-1 flex items-center px-10">
        <p className="rise m-0 text-[46px] leading-[1.08] font-semibold tracking-[-0.03em]">{s.visual === "text" ? s.overlay || s.say : s.overlay}</p>
      </div>
    );
  }
  if (s.visual === "type") {
    return (
      <div className="flex-1 flex items-center px-8">
        <div className="w-full">
          <TypeCard handle={t.handle} platform={t.platform === "instagram" ? "instagram" : "tiktok"} followers={t.followers} stats={t.stats} voice="they" run={run} />
        </div>
      </div>
    );
  }
  if (s.visual === "intro") {
    return (
      <div className="flex-1 flex flex-col justify-center px-10 gap-8">
        <div className="flex items-center gap-4 rise">
          <Initial name={t.handle} size={76} />
          <div>
            <div className="text-[30px] font-semibold tracking-[-0.02em]">@{t.handle}</div>
            <div className="text-[18px] text-ink-3">
              {t.platform === "tiktok" ? "TikTok" : "Instagram"}
              {t.followers ? ` · ${compact(t.followers)} followers` : ""}
            </div>
          </div>
        </div>
        <div className="rise" style={{ animationDelay: "200ms" }}>
          <div className="text-[18px] text-ink-3">Usual post</div>
          <div className="text-[96px] font-semibold leading-none tracking-[-0.04em] mt-1">
            <CountUp value={t.stats.medianInteractions} run={run} ms={1100} format={(n) => compact(n)} delay={250} />
          </div>
          <div className="text-[18px] text-ink-3 mt-2">likes + comments + shares</div>
        </div>
      </div>
    );
  }
  if (s.visual === "chart") {
    return (
      <div className="flex-1 flex flex-col justify-center px-8 gap-5">
        <div className="text-[18px] text-ink-3">Last {posts.length} posts against their usual</div>
        <PostBars posts={posts} run={run} height={380} stagger={110} />
        <div className="text-[15px]">
          <TierLegend />
        </div>
      </div>
    );
  }
  if (s.visual === "post" && s.post) {
    const p = s.post;
    return (
      <div className="flex-1 flex flex-col justify-center px-8 gap-6">
        <div className="card p-6 rise">
          <span className={`badge ${p.tier === "breakout" ? "badge-pos" : p.tier === "stalled" ? "badge-neg" : "badge-outline"}`}>{TIER_LABEL[p.tier]}</span>
          <p className="m-0 mt-4 text-[30px] leading-[1.2] font-semibold tracking-[-0.02em]">&ldquo;{(p.caption ?? "No caption").slice(0, 120)}&rdquo;</p>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-[72px] font-semibold leading-none tracking-[-0.04em]">
              <CountUp value={p.multiple} run={run} format={(n) => `${n.toFixed(1)}×`} delay={300} />
            </span>
            <span className="text-[20px] text-ink-3">usual</span>
          </div>
        </div>
        <PostBars posts={posts} run={run} height={150} highlight={s.postIndex} stagger={40} labels={false} />
      </div>
    );
  }
  if (s.visual === "compare") {
    const pick = (tier: ScoredPost["tier"]) =>
      posts
        .filter((p) => p.tier === tier)
        .sort((a, b) => (tier === "breakout" ? b.multiple - a.multiple : a.multiple - b.multiple))
        .slice(0, 3);
    return (
      <div className="flex-1 flex flex-col justify-center px-8 gap-6">
        {[
          { title: "Broke out", dot: "bg-pos", list: pick("breakout") },
          { title: "Stalled", dot: "bg-neg", list: pick("stalled") },
        ].map((col, i) => (
          <div key={col.title} className="rise" style={{ animationDelay: `${i * 450}ms` }}>
            <div className="flex items-center gap-2 text-[18px] font-semibold">
              <span className={`w-3 h-3 rounded-full ${col.dot}`} />
              {col.title}
            </div>
            <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-2.5">
              {col.list.map((p, k) => (
                <li key={k} className="card px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-[19px] leading-[1.25] font-medium line-clamp-2">{p.caption ?? "No caption"}</span>
                  <span className="text-[19px] font-semibold tnum shrink-0">{p.multiple}×</span>
                </li>
              ))}
              {!col.list.length && <li className="text-[18px] text-ink-3">None</li>}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  // The close.
  return (
    <div className="flex-1 flex flex-col justify-center items-center text-center px-10 gap-6">
      <p className="rise m-0 text-[52px] leading-[1.05] font-semibold tracking-[-0.035em]">What&apos;s your type?</p>
      <div className="rise card px-6 py-4" style={{ animationDelay: "250ms" }}>
        <div className="text-[16px] text-ink-3">Find yours free</div>
        <div className="text-[30px] font-semibold tracking-[-0.02em] mt-1">usetrnd.com/creators</div>
      </div>
      <div className="rise text-[20px] text-ink-2" style={{ animationDelay: "500ms" }}>
        Link in bio
      </div>
    </div>
  );
}

export default function TeardownPlayer({ t }: { t: PlayerTeardown }) {
  const scenes = useMemo(() => buildScenes(t), [t]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(1);
  const [scale, setScale] = useState(0.8);
  const stage = useRef<HTMLDivElement>(null);
  const s = scenes[i];

  const go = useCallback(
    (next: number) => {
      setI(Math.max(0, Math.min(scenes.length - 1, next)));
      setElapsed(0);
      setRun(Date.now());
    },
    [scenes.length],
  );

  // Fit the 540x960 frame to the window.
  useEffect(() => {
    const fit = () => setScale(Math.min((window.innerHeight - 24) / H, (window.innerWidth - 24) / W));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // The clock: advance through the scene, then to the next; stop after the last.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setElapsed((e) => e + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  useEffect(() => {
    if (!playing || elapsed < s.ms) return;
    const id = requestAnimationFrame(() => {
      if (i < scenes.length - 1) go(i + 1);
      else setPlaying(false);
    });
    return () => cancelAnimationFrame(id);
  }, [elapsed, playing, s.ms, i, scenes.length, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === "r" || e.key === "R") {
        go(0);
        setPlaying(true);
      } else if (e.key === "c" || e.key === "C") setCaptions((c) => !c);
      else if (e.key === "f" || e.key === "F") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  const parts = chunks(s.say);
  const part = parts[Math.min(parts.length - 1, Math.floor((elapsed / s.ms) * parts.length))];
  const total = scenes.reduce((a, x) => a + x.ms, 0);

  return (
    <div className={`fixed inset-0 bg-muted grid place-items-center overflow-hidden ${playing ? "cursor-none" : ""}`}>
      <div style={{ width: W * scale, height: H * scale }}>
        <div
          ref={stage}
          className="bg-bg text-ink flex flex-col origin-top-left overflow-hidden shadow-[var(--shadow-lg)]"
          style={{ width: W, height: H, transform: `scale(${scale})`, borderRadius: 18 }}
        >
          {/* Progress, one segment per scene, as stories show it. */}
          <div className="flex gap-1 px-5 pt-5">
            {scenes.map((x, k) => (
              <div key={k} className="h-[3px] flex-1 rounded-full bg-line overflow-hidden">
                <div className="h-full bg-ink" style={{ width: k < i ? "100%" : k === i ? `${Math.min(100, (elapsed / x.ms) * 100)}%` : "0%" }} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-6 pt-4 text-[14px]">
            <span className="inline-flex items-center gap-2 font-medium tracking-[0.25em]">
              <span className="w-2 h-2 rounded-full bg-brand" />
              TRND
            </span>
            <span className="text-ink-3">@{t.handle} teardown</span>
          </div>

          {s.overlay && s.visual !== "hook" && s.visual !== "text" && s.visual !== "cta" && (
            <p key={`o-${i}-${run}`} className="rise m-0 px-8 pt-10 text-[34px] leading-[1.1] font-semibold tracking-[-0.025em]">
              {s.overlay}
            </p>
          )}
          <SceneView key={`${i}-${run}`} s={s} t={t} run={run} />

          <div className="h-[150px] px-8 flex items-start justify-center text-center">
            {captions && s.visual !== "hook" && (
              <p key={part} className="m-0 text-[24px] leading-[1.3] font-semibold bg-ink text-bg px-3 py-1.5 rounded-lg">
                {part}
              </p>
            )}
          </div>
        </div>
      </div>

      {!playing && (
        <div className="fixed left-4 bottom-4 card p-4 text-[13px] max-w-[300px] flex flex-col gap-2">
          <div className="font-semibold">Record this teardown</div>
          <p className="m-0 text-ink-2 leading-[1.5]">
            Start a screen recording of the frame, then press <kbd>R</kbd>. It runs {Math.round(total / 1000)}s and stops on the last scene. Record your voiceover
            over it, or read the captions.
          </p>
          <div className="caption leading-[1.6]">
            Space play/pause · ← → scenes · R restart · C captions {captions ? "off" : "on"} · F full screen
            <br />
            Scene {i + 1} of {scenes.length}: {s.visual}
          </div>
          <Link href={`/studio/teardowns/${t.id}`} className="text-brand">
            Back to the script
          </Link>
        </div>
      )}
    </div>
  );
}
