import { compact } from "@/lib/format";
import { dollarRange, type Gap, RPM_ASSUMPTION } from "@/lib/creators/gap";

/**
 * The gap, said as the brief's hook: their typical video against the creators
 * just ahead of them, and (for an account that can earn it) what that is worth
 * from Creator Rewards, with the rate's assumption on hover. The paid CTA goes
 * in `children`, directly under the number.
 */
export default function GapCard({ gap, voice = "you", children }: { gap: Gap; voice?: "you" | "they"; children?: React.ReactNode }) {
  const your = voice === "you" ? "Your" : "Their";
  const behind = gap.ahead > gap.mine;
  const share = Math.max(4, Math.min(100, Math.round((gap.mine / Math.max(gap.ahead, gap.mine)) * 100)));
  const who = gap.band === "2-5x" ? `Creators 2–5× ${voice === "you" ? "your" : "their"} size in ${voice === "you" ? "your" : "their"} niche` : `Creators ahead of ${voice === "you" ? "you" : "them"} in ${voice === "you" ? "your" : "their"} niche`;
  return (
    <section className="card p-5 sm:p-6 grid gap-5" aria-label="The gap">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="label">{your} typical video</div>
          <div className="stat-num my-1">{compact(gap.mine)}</div>
          <div className="caption">views</div>
        </div>
        <div>
          <div className="label">{who}</div>
          <div className="stat-num my-1 text-brand">{compact(gap.ahead)}</div>
          <div className="caption">
            average typical views, {gap.creators} creator{gap.creators === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="grid gap-1.5" aria-hidden>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-ink-3" style={{ width: `${share}%` }} />
        </div>
        <div className="h-2.5 rounded-full bg-brand" />
      </div>
      {gap.dollars ? (
        <p className="text-[16px] leading-[1.5] m-0">
          At current Creator Rewards rates, that gap is roughly <b className="tnum">{dollarRange(gap.dollars)}</b>{" "}
          <span className="relative inline-block group align-middle">
            <button type="button" className="w-5 h-5 rounded-full border border-line-strong text-[11px] font-bold text-ink-2 leading-none" aria-describedby="rpm-assumption">
              ?
            </button>
            <span id="rpm-assumption" role="tooltip" className="pointer-events-none absolute z-20 right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 bottom-[calc(100%+8px)] w-[min(320px,78vw)] rounded-[10px] border border-line bg-surface p-3 text-[12.5px] leading-[1.5] text-ink-2 shadow-[var(--shadow-md)] hidden group-hover:block group-focus-within:block">
              {RPM_ASSUMPTION} Assumes {gap.perMonth} video{gap.perMonth === 1 ? "" : "s"} a month.
            </span>
          </span>
        </p>
      ) : (
        behind && (
          <p className="text-[16px] leading-[1.5] m-0">
            That&apos;s <b className="tnum">{compact(gap.ahead - gap.mine)}</b> more views on a typical video.
          </p>
        )
      )}
      {children}
    </section>
  );
}
