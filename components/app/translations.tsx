import type { Ad, Translation } from "@/lib/db/types";

import Avatar from "./avatar";
import Evidence from "./evidence";

const VERDICT = {
  copy: { label: "Copy it", cls: "badge badge-pos" },
  adapt: { label: "Adapt it", cls: "badge badge-warn" },
  skip: { label: "Skip it", cls: "badge" },
} as const;

/** Each competitor move that matters, judged for this brand: copy, adapt or skip, why, and how. */
export default function Translations({ items, ads }: { items: Translation[]; ads: Map<string, Ad> }) {
  const order = { copy: 0, adapt: 1, skip: 2 } as const;
  const sorted = [...items].sort((a, b) => order[a.verdict] - order[b.verdict]);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {sorted.map((t, i) => (
        <article key={i} className={`card p-5 flex flex-col ${t.verdict === "skip" ? "opacity-85" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2 min-w-0">
              <Avatar name={t.competitor} size={20} />
              <span className="truncate">{t.competitor}</span>
            </span>
            <span className={VERDICT[t.verdict].cls}>{VERDICT[t.verdict].label}</span>
          </div>
          <h3 className="text-[15px] font-semibold leading-snug mt-3">{t.move}</h3>
          <p className="text-[13.5px] text-ink-2 leading-[1.6] mt-1.5">{t.why}</p>
          <div className="well px-3.5 py-3 mt-3">
            <div className="text-[12px] font-medium text-ink-3">{t.verdict === "skip" ? "Instead" : "How to make it yours"}</div>
            <p className="text-[13.5px] leading-[1.55] mt-1">{t.adapt}</p>
          </div>
          <div className="mt-auto">
            <Evidence ids={t.evidence} ads={ads} label="Their ads" />
          </div>
        </article>
      ))}
    </div>
  );
}
