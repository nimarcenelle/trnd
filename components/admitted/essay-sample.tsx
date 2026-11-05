import { ESSAY } from "./sample";

/** The essay workspace in miniature: the score, the draft with its lines marked, and the first fix. */
export default function EssaySample() {
  const [before, rest] = ESSAY.draft.split(ESSAY.keepLine);
  const [middle, after] = rest.split(ESSAY.fixLine);
  return (
    <div className="card w-full max-w-[520px] overflow-hidden text-left">
      <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold">{ESSAY.prompt}</span>
        <span className="text-[12px] text-ink-3">Sample</span>
      </div>
      <p className="px-5 py-4 text-[14px] leading-[1.7]">
        {before}
        <mark className="rounded-[3px] px-0.5 bg-pos-bg text-ink">{ESSAY.keepLine}</mark>
        {middle}
        <mark className="rounded-[3px] px-0.5 bg-[var(--soft)] text-ink">
          {ESSAY.fixLine}
          <sup className="ml-0.5 text-[11px] font-semibold tnum text-[var(--soft-ink)]">1</sup>
        </mark>
        {after}
      </p>
      <div className="px-5 py-4 border-t border-line bg-subtle">
        <div className="flex gap-3">
          <span className="h-5 w-5 shrink-0 rounded-full bg-[var(--soft)] text-[var(--soft-ink)] text-[11px] font-semibold tnum flex items-center justify-center">1</span>
          <div className="min-w-0 text-[14px] leading-[1.55]">
            <p className="font-medium">{ESSAY.fix}</p>
            <p className="text-[13px] text-ink-2 mt-1">{ESSAY.problem}</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-line flex items-baseline justify-between gap-3">
        <span className="tnum">
          <span className="text-[20px] font-semibold">{ESSAY.score}</span>
          <span className="text-[13px] text-ink-3"> / 100</span>
        </span>
        <span className="text-[13px] tnum text-ink-3">
          After rewrite <span className="font-semibold text-brand">{ESSAY.after}</span>
        </span>
      </div>
    </div>
  );
}
