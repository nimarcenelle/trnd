"use client";

import { useEffect, useRef, useState } from "react";

import type { CardData } from "@/lib/creator/card";
import type { ScoredPost } from "@/lib/creator/stats";
import { BREAKOUT_X } from "@/lib/creator/stats";
import { compact } from "@/lib/format";

/**
 * The creator check's visuals, built to be screen-recorded: every number
 * counts up and every bar grows from the baseline, in order, so a recording
 * of the page is the video. Under reduced motion everything is simply there.
 */

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up from zero when `run` turns on (or changes). */
export function CountUp({ value, run = true, ms = 900, format = (n: number) => String(Math.round(n)), delay = 0 }: { value: number; run?: boolean | number; ms?: number; format?: (n: number) => string; delay?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (reducedMotion()) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, run, ms, delay]);
  return <span className="tnum">{format(shown)}</span>;
}

/** True one frame after `run` turns on, so a CSS transition has a start state to leave. */
function useStarted(run: boolean | number) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      setStarted(false);
      if (run) b = requestAnimationFrame(() => setStarted(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [run]);
  return started;
}

const FILL: Record<ScoredPost["tier"], string> = {
  breakout: "var(--pos)",
  stalled: "var(--neg)",
  typical: "color-mix(in srgb, var(--ink) 22%, var(--bg))",
};

export const TIER_LABEL: Record<ScoredPost["tier"], string> = { breakout: "Broke out", typical: "Usual", stalled: "Stalled" };

/**
 * One column per post, oldest on the left, its height its multiple of the
 * creator's usual. The 1× and 2× lines are drawn, so a post's tier reads from
 * its position as well as its color.
 */
export function PostBars({
  posts,
  run = true,
  height = 180,
  highlight,
  stagger = 70,
  labels = true,
}: {
  posts: ScoredPost[];
  run?: boolean | number;
  height?: number;
  /** Index into `posts` (newest first) to keep at full strength; the rest dim. */
  highlight?: number | null;
  stagger?: number;
  labels?: boolean;
}) {
  const started = useStarted(run);
  const [hover, setHover] = useState<number | null>(null);
  const ordered = posts.map((p, i) => ({ p, i })).reverse();
  const best = Math.max(...posts.map((p) => p.multiple));
  const max = Math.max(best * 1.12, BREAKOUT_X * 1.3);
  const bestIdx = posts.findIndex((p) => p.multiple === best);
  const y = (m: number) => `${(Math.min(m, max) / max) * 100}%`;
  const hovered = hover !== null ? posts[hover] : null;

  return (
    <div className="relative select-none" style={{ height }}>
      {/* Reference lines: 1× (their usual) and 2× (the breakout line). */}
      {[
        { m: 1, label: "usual" },
        { m: BREAKOUT_X, label: `${BREAKOUT_X}×` },
      ].map((l) => (
        <div key={l.m} className="absolute left-0 right-0 border-t border-line-strong" style={{ bottom: y(l.m) }} aria-hidden>
          {labels && <span className="absolute right-0 top-0 -translate-y-1/2 text-[11px] leading-none text-ink-3 bg-bg pl-1.5">{l.label}</span>}
        </div>
      ))}
      <div className={`absolute inset-y-0 left-0 ${labels ? "right-[38px]" : "right-0"} flex items-end justify-around gap-[2px] border-b border-line-strong`} role="img" aria-label={`${posts.length} posts against their usual engagement`}>
        {ordered.map(({ p, i }, k) => {
          const dim = highlight !== undefined && highlight !== null && highlight !== i;
          return (
            <div
              key={p.url ?? i}
              className="relative flex-1 h-full flex items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${p.caption ?? "Post"}: ${p.multiple}× usual, ${TIER_LABEL[p.tier].toLowerCase()}`}
            >
              <div
                className="creator-bar w-full max-w-[24px] rounded-t-[4px]"
                style={{
                  height: `max(3px, ${y(p.multiple)})`,
                  background: FILL[p.tier],
                  opacity: dim ? 0.25 : 1,
                  transform: started ? "scaleY(1)" : "scaleY(0)",
                  transitionDelay: started ? `${k * stagger}ms` : "0ms",
                }}
              />
              {labels && i === bestIdx && (
                <span
                  className="creator-bar-label absolute text-[12px] font-semibold tnum text-ink whitespace-nowrap"
                  style={{ bottom: `calc(${y(p.multiple)} + 4px)`, opacity: started ? 1 : 0, transitionDelay: started ? `${ordered.length * stagger + 200}ms` : "0ms" }}
                >
                  {p.multiple}×
                </span>
              )}
            </div>
          );
        })}
      </div>
      {hovered && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-10 w-[min(280px,90%)] card px-3 py-2 text-[12.5px] pointer-events-none">
          <div className="truncate font-medium">{hovered.caption ?? "No caption"}</div>
          <div className="text-ink-3 tnum mt-0.5">
            {hovered.multiple}× usual · {compact(hovered.interactions)} interactions · {TIER_LABEL[hovered.tier]}
          </div>
        </div>
      )}
    </div>
  );
}

export function TierLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {(["breakout", "typical", "stalled"] as const).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: FILL[t] }} />
          {t === "breakout" ? `Broke out (${BREAKOUT_X}× or more)` : t === "stalled" ? "Stalled (half or less)" : "Usual"}
        </span>
      ))}
    </div>
  );
}

export function Initial({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className="rounded-full bg-ink text-bg grid place-items-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {name.replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}


/**
 * The result as one card: who, the headline number, the chart, the pattern,
 * and the address. Sized and spaced to read in a screenshot or a phone
 * recording; the footer is what a viewer types to get their own.
 */
export function ResultCard({ d, run = true, voice = "you" }: { d: CardData; run?: boolean | number; voice?: "you" | "they" }) {
  const n = d.posts.length;
  const their = voice === "you" ? "your" : "their";
  return (
    <div className="card overflow-hidden text-left">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3 min-w-0">
          <Initial name={d.handle} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">@{d.handle}</div>
            <div className="caption truncate">
              {d.platform === "tiktok" ? "TikTok" : "Instagram"}
              {d.followers ? ` · ${compact(d.followers)} followers` : ""}
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.25em] text-ink-2 shrink-0" aria-hidden>
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          TRND
        </span>
      </div>

      <div className="px-5 pt-6">
        <div className="caption">Last {n} posts</div>
        <div className="flex items-baseline gap-2.5 mt-1">
          <span className="text-[56px] sm:text-[64px] font-semibold leading-none tracking-[-0.04em]">
            <CountUp value={d.breakouts} run={run} ms={700} />
            <span className="text-ink-3">/{n}</span>
          </span>
          <span className="text-[17px] font-medium leading-tight">
            broke out
            <span className="block text-[13px] font-normal text-ink-3">
              best at <CountUp value={d.bestMultiple} run={run} format={(x) => `${x.toFixed(1)}×`} delay={300} /> {their} usual
            </span>
          </span>
        </div>
      </div>

      <div className="px-5 pt-8">
        <PostBars posts={d.posts} run={run} height={170} />
        <div className="mt-3">
          <TierLegend />
        </div>
      </div>

      {d.verdict && (
        <div className="px-5 pt-5">
          <p className="text-[15px] leading-[1.5] font-medium m-0">{d.verdict}</p>
        </div>
      )}

      <div className="mt-5 px-5 py-3 border-t border-line bg-subtle flex items-center justify-between gap-3 text-[12px]">
        <span className="text-ink-3 tnum">Usual post: {compact(d.medianInteractions)} likes + comments</span>
        <span className="font-medium text-ink-2">usetrnd.com/creators</span>
      </div>
    </div>
  );
}

/** Restarts a card's animation: bump the number it is given as `run`. */
export function useReplay(): [number, () => void] {
  const [n, setN] = useState(1);
  const busy = useRef(false);
  return [
    n,
    () => {
      if (busy.current) return;
      busy.current = true;
      setN(0);
      setTimeout(() => {
        setN(Date.now());
        busy.current = false;
      }, 60);
    },
  ];
}
