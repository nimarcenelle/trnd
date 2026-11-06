"use client";

import type { Benchmark } from "@/lib/creator/benchmark";
import { diagnosis, killerFromNumbers, theirs, type CreatorStats, type ScoredPost } from "@/lib/creator/stats";
import { compact } from "@/lib/format";

/**
 * The result as a diagnosis: how many of their posts never got past their
 * followers, the one thing killing them, and the fix. Dark in both themes so
 * a shared one looks the same everywhere; the address is on it, so every
 * screenshot carries it.
 */

const TILE: Record<ScoredPost["tier"], string> = { breakout: "bg-stage-pos", stalled: "bg-stage-neg", typical: "bg-stage-usual" };

export interface DiagnosisCardProps {
  handle: string;
  platform: "instagram" | "tiktok";
  followers?: number | null;
  stats: CreatorStats;
  /** The one thing killing the posts (the written read); worked out from the numbers when missing. */
  killer?: string | null;
  /** The first hook to post next, if there is one. */
  fix?: string | null;
  /** The top posts in their niche, for the "you against the top" bar. */
  benchmark?: Benchmark | null;
  voice?: "you" | "they";
  /** Change it to play the entrance again (for a second screen-recording take). */
  run?: number;
  /** Smaller, for the sample cards on the landing page. */
  compact?: boolean;
}

/** Their usual post against the top of their niche: per follower when the counts allow, raw otherwise. */
function GapBar({ b, voice, delay }: { b: Benchmark; voice: "you" | "they"; delay: number }) {
  const perFollower = b.perFollowerGap !== null && b.perFollowerGap >= 1.5;
  const x = perFollower ? b.perFollowerGap! : b.gap;
  if (x < 1.5) return null;
  const you = Math.max(3, 100 / x);
  return (
    <div className="rise mt-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-[12px] text-stage-ink-2">
        {voice === "you" ? "You" : "Them"} against the top of #{b.tag}
        {perFollower ? ", per follower" : ""}
      </div>
      <div className="mt-2 grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[12px]">
        <span className="text-stage-ink-2">{voice === "you" ? "Your usual" : "Their usual"}</span>
        <span className="h-3 rounded-[4px] bg-stage-usual" style={{ width: `${you}%` }} />
        <span className="text-stage-ink-2">Top posts</span>
        <span className="h-3 rounded-[4px] bg-stage-pos w-full" />
      </div>
      <div className="mt-2 text-[15px] font-semibold">
        {x}× behind
      </div>
    </div>
  );
}

export default function DiagnosisCard({ handle, platform, followers, stats, killer, fix, benchmark, voice = "you", run = 1, compact: small = false }: DiagnosisCardProps) {
  const say = (t: string) => (voice === "you" ? t : theirs(t));
  const ordered = [...stats.posts].reverse();
  const n = stats.posts.length;
  const stuck = n - stats.breakouts;
  return (
    <div key={run} className={`stage text-left ${small ? "p-5" : "p-6 sm:p-7"}`}>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-medium tracking-[0.25em]">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          TRND
        </span>
        <span className="text-stage-ink-2 truncate">
          @{handle} · {platform === "tiktok" ? "TikTok" : "Instagram"}
          {followers ? ` · ${compact(followers)}` : ""}
        </span>
      </div>

      <div className={small ? "mt-6" : "mt-9"}>
        <div className={`rise font-semibold tracking-[-0.045em] leading-none ${small ? "text-[52px]" : "text-[72px] sm:text-[84px]"}`}>
          {stuck}
          <span className="text-stage-ink-2">/{n}</span>
        </div>
        <p className={`rise m-0 mt-2 font-medium leading-[1.3] ${small ? "text-[15px]" : "text-[19px]"}`} style={{ animationDelay: "120ms" }}>
          {voice === "you" ? "of your posts never got past your followers" : "of their posts never got past their followers"}
        </p>
      </div>

      <div className={small ? "mt-5" : "mt-6"}>
        <div className="flex gap-[5px]" role="img" aria-label={say(diagnosis(stats))}>
          {ordered.map((p, i) => (
            <span
              key={i}
              className={`pop flex-1 aspect-square max-w-[30px] rounded-[7px] ${TILE[p.tier]}`}
              style={{ animationDelay: `${260 + i * 55}ms` }}
              title={`${p.caption ?? "Post"}: ${p.multiple}× usual`}
            />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-stage-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[3px] bg-stage-pos" />
            {stats.breakouts} broke out
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[3px] bg-stage-usual" />
            {n - stats.breakouts - stats.stalled} stuck
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[3px] bg-stage-neg" />
            {stats.stalled} flopped
          </span>
        </div>
      </div>

      {benchmark && <GapBar b={benchmark} voice={voice} delay={300 + ordered.length * 55} />}

      <div className={`rise rounded-[14px] bg-stage-raise ${small ? "mt-5 p-4" : "mt-7 p-5"}`} style={{ animationDelay: `${360 + ordered.length * 55}ms` }}>
        <div className="text-[12px] font-medium text-stage-neg">What&apos;s killing {voice === "you" ? "your" : "their"} posts</div>
        <p className={`m-0 mt-1.5 font-semibold leading-[1.3] ${small ? "text-[15px]" : "text-[19px]"}`}>{say(killer || killerFromNumbers(stats))}</p>
        {fix && (
          <>
            <div className="text-[12px] font-medium text-stage-pos mt-4">Post this instead</div>
            <p className={`m-0 mt-1.5 leading-[1.35] ${small ? "text-[14px]" : "text-[16px]"}`}>&ldquo;{fix}&rdquo;</p>
          </>
        )}
      </div>

      {!small && (
        <div className="mt-7 pt-4 border-t border-stage-line flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-stage-ink-2">Why do yours flop?</span>
          <span className="font-semibold">usetrnd.com/creators</span>
        </div>
      )}
    </div>
  );
}
