import { ESSAY } from "./sample";

/** One essay opening, before and after, and what the change is worth in points. */
export default function EssaySample({ gain = ESSAY.gain, where = ESSAY.where }: { gain?: number; where?: string }) {
  return (
    <div className="card w-full max-w-[520px] overflow-hidden text-left">
      <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold">{ESSAY.prompt}</span>
        <span className="text-[12px] text-ink-3">Sample</span>
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="rounded-[10px] bg-muted p-4">
          <div className="text-[12px] font-medium text-ink-3">Before</div>
          <p className="text-[14px] leading-[1.65] text-ink-2 mt-1.5">{ESSAY.before}</p>
        </div>
        <div className="rounded-[10px] bg-pos-bg p-4">
          <div className="text-[12px] font-medium text-brand">After</div>
          <p className="text-[14px] leading-[1.65] mt-1.5">{ESSAY.after}</p>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-line text-[14px]">
        <span className="tnum font-semibold text-brand">+{gain} pts</span> <span className="text-ink-2">at {where}</span>
      </div>
    </div>
  );
}
