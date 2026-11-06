"use client";

import type { CreatorStats } from "@/lib/creator/stats";
import { creatorType, theirLine } from "@/lib/creator/types";
import { compact } from "@/lib/format";

/**
 * The result as something worth posting: a creator type, the shape of their
 * last 12 posts as a row of tiles, and their best post in their own words.
 * Dark in both themes, like a card you'd collect. The address is on it, so
 * every screenshot carries it.
 */

const TILE: Record<string, string> = { breakout: "bg-stage-pos", stalled: "bg-stage-neg", typical: "bg-stage-usual" };

export interface TypeCardProps {
  handle: string;
  platform: "instagram" | "tiktok";
  followers?: number | null;
  stats: CreatorStats;
  voice?: "you" | "they";
  /** Change it to play the entrance again (for a second screen-recording take). */
  run?: number;
  /** Smaller type, for the sample cards on the landing page. */
  compact?: boolean;
}

export default function TypeCard({ handle, platform, followers, stats, voice = "you", run = 1, compact: small = false }: TypeCardProps) {
  const type = creatorType(stats);
  const best = stats.posts.reduce((b, p) => (p.multiple > b.multiple ? p : b), stats.posts[0]);
  const ordered = [...stats.posts].reverse();
  const line = voice === "you" ? type.line : theirLine(type.line);
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
        <div className="text-[13px] text-stage-ink-2 rise">{voice === "you" ? "Your posting type" : `@${handle}'s posting type`}</div>
        <div className={`rise font-semibold tracking-[-0.035em] leading-[1.02] mt-1.5 ${small ? "text-[30px]" : "text-[40px] sm:text-[46px]"}`} style={{ animationDelay: "120ms" }}>
          {type.name}
        </div>
        <p className={`rise m-0 mt-3 text-stage-ink-2 leading-[1.5] ${small ? "text-[13.5px]" : "text-[15.5px]"}`} style={{ animationDelay: "260ms" }}>
          {line}
        </p>
      </div>

      <div className={small ? "mt-5" : "mt-7"}>
        <div className="flex gap-[5px]" role="img" aria-label={`Last ${stats.posts.length} posts, oldest first: ${ordered.map((p) => p.tier).join(", ")}`}>
          {ordered.map((p, i) => (
            <span
              key={i}
              className={`pop flex-1 aspect-square max-w-[30px] rounded-[7px] ${TILE[p.tier]}`}
              style={{ animationDelay: `${420 + i * 55}ms` }}
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
            <span className="w-2 h-2 rounded-[3px] bg-stage-neg" />
            {stats.stalled} stalled
          </span>
          <span>last {stats.posts.length} posts</span>
        </div>
      </div>

      {best && (
        <div className={`rise rounded-[14px] bg-stage-raise ${small ? "mt-5 p-4" : "mt-7 p-5"}`} style={{ animationDelay: `${520 + ordered.length * 55}ms` }}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-stage-ink-2">{voice === "you" ? "Your best post" : "Best post"}</span>
            <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 bg-stage-pos text-stage tnum">{best.multiple}× usual</span>
          </div>
          <p className={`m-0 mt-2 font-semibold leading-[1.3] line-clamp-3 ${small ? "text-[15px]" : "text-[18px]"}`}>&ldquo;{best.caption ?? "No caption"}&rdquo;</p>
        </div>
      )}

      {!small && (
        <div className="mt-7 pt-4 border-t border-stage-line flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-stage-ink-2">Find your type</span>
          <span className="font-semibold">usetrnd.com/creators</span>
        </div>
      )}
    </div>
  );
}
