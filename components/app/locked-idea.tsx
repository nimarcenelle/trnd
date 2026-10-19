import type { IdeaType } from "@/lib/db/types";

import { IDEA_TYPE } from "./idea-card";

/** An idea shown by its hook only: what the trial unlocks. */
export default function LockedIdea({ hook, type, rank, cta }: { hook: string; type: IdeaType; rank: number; cta?: React.ReactNode }) {
  return (
    <div className="card !rounded-[18px] overflow-hidden relative">
      <div className="p-[18px] grid grid-cols-[auto_minmax(0,1fr)] gap-3.5">
        <span className="display text-[26px] text-brand leading-none w-[22px] text-center">{rank}</span>
        <div className="min-w-0">
          <span className={IDEA_TYPE[type].cls}>{IDEA_TYPE[type].label}</span>
          <p className="heading text-[clamp(17px,2.4vw,21px)] leading-[1.25] mt-1.5">{hook}</p>
          <div aria-hidden className="mt-3 grid gap-2 select-none blur-[5px] opacity-70">
            <div className="h-3 rounded bg-muted w-[92%]" />
            <div className="h-3 rounded bg-muted w-[78%]" />
            <div className="h-3 rounded bg-muted w-[85%]" />
          </div>
        </div>
      </div>
      <div className="border-t border-line px-[18px] py-3 bg-subtle text-[13.5px] text-ink-2 flex items-center gap-2">
        <svg aria-hidden viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
        <span className="flex-1">Script, sound, caption and hashtags unlock with your free trial.</span>
        {cta}
      </div>
    </div>
  );
}
