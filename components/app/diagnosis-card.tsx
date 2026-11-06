import type { Diagnosis, Tile } from "@/lib/creators/diagnosis";
import { killerFromNumbers } from "@/lib/creators/diagnosis";
import { compact } from "@/lib/format";
import type { Gap } from "@/lib/creators/gap";

/**
 * The funnel's hook: how many of their recent videos never got past their
 * followers, the shape of those videos as tiles, how far behind the creators
 * ahead of them they are, and the one thing killing their posts. Locked (free),
 * that line is blurred filler and the fix is held back: only the paid plan says
 * what's wrong. Dark in both themes, with the address on it, so a screenshot
 * carries it.
 */

const TILE: Record<Tile, string> = { breakout: "bg-night-pos", stuck: "bg-night-usual", flop: "bg-night-neg" };

export default function DiagnosisCard({
  handle,
  followers,
  d,
  gap,
  killer,
  fix,
  locked = false,
  voice = "you",
  compact: small = false,
}: {
  handle: string;
  followers: number | null;
  d: Diagnosis;
  gap?: Gap | null;
  /** The plan's one line on what's killing the posts. */
  killer?: string | null;
  /** The first hook to post instead. */
  fix?: string | null;
  locked?: boolean;
  voice?: "you" | "they";
  compact?: boolean;
}) {
  const your = voice === "you" ? "your" : "their";
  const behind = gap && gap.ahead > gap.mine ? Math.round((gap.ahead / Math.max(1, gap.mine)) * 10) / 10 : null;
  return (
    <div className={`night text-left ${small ? "p-5" : "p-6 sm:p-7"}`}>
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-medium tracking-[0.25em]">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          TRND
        </span>
        <span className="text-night-ink-2 truncate">
          @{handle}
          {followers ? ` · ${compact(followers)}` : ""}
        </span>
      </div>

      <div className={small ? "mt-6" : "mt-8"}>
        <div className={`font-semibold tracking-[-0.045em] leading-none tnum ${small ? "text-[52px]" : "text-[72px] sm:text-[84px]"}`}>
          {d.stuck}
          <span className="text-night-ink-2">/{d.n}</span>
        </div>
        <p className={`m-0 mt-2 font-medium leading-[1.3] ${small ? "text-[15px]" : "text-[19px]"}`}>of {your} videos never got past {your} followers</p>
      </div>

      <div className={small ? "mt-5" : "mt-6"}>
        <div className="flex gap-[5px]" role="img" aria-label={`${d.breakouts} broke out, ${d.stuck - d.flopped} stayed with ${your} followers, ${d.flopped} flopped`}>
          {d.tiles.map((t, i) => (
            <span key={i} className={`flex-1 aspect-square max-w-[30px] rounded-[7px] ${TILE[t]}`} />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-night-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[3px] bg-night-pos" />
            {d.breakouts} broke out
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[3px] bg-night-usual" />
            {d.stuck - d.flopped} stuck
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[3px] bg-night-neg" />
            {d.flopped} flopped
          </span>
        </div>
      </div>

      {behind && behind >= 1.5 && (
        <div className="mt-6">
          <div className="text-[12px] text-night-ink-2">{voice === "you" ? "You" : "Them"} against the creators ahead</div>
          <div className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[12px]">
            <span className="text-night-ink-2">{voice === "you" ? "Your" : "Their"} usual</span>
            <span className="h-3 rounded-[4px] bg-night-usual" style={{ width: `${Math.max(3, 100 / behind)}%` }} />
            <span className="text-night-ink-2">Ahead</span>
            <span className="h-3 rounded-[4px] bg-night-pos w-full" />
          </div>
          <div className="mt-2 text-[15px] font-semibold tnum">{behind}× behind</div>
        </div>
      )}

      <div className={`rounded-[14px] bg-night-raise ${small ? "mt-5 p-4" : "mt-6 p-5"}`}>
        <div className="text-[12px] font-medium text-night-neg">What&apos;s killing {your} posts</div>
        {locked ? (
          <p className="m-0 mt-1.5 font-semibold leading-[1.3] text-[18px] blur-[7px] select-none" aria-hidden>
            Your openings give nobody a reason to keep watching past the first line.
          </p>
        ) : (
          <p className={`m-0 mt-1.5 font-semibold leading-[1.3] ${small ? "text-[15px]" : "text-[18px]"}`}>{killer || killerFromNumbers(d)}</p>
        )}
        {fix && !locked && (
          <>
            <div className="text-[12px] font-medium text-night-pos mt-4">Post this instead</div>
            <p className={`m-0 mt-1.5 leading-[1.35] ${small ? "text-[14px]" : "text-[16px]"}`}>{fix}</p>
          </>
        )}
      </div>

      {!small && (
        <div className="mt-6 pt-4 border-t border-night-line flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-night-ink-2">Why do yours flop?</span>
          <span className="font-semibold">creators.usetrnd.com</span>
        </div>
      )}
    </div>
  );
}
