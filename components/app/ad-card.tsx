import { daysRunningOf, libraryLink } from "@/lib/format";
import type { Ad } from "@/lib/db/types";

import AdThumb from "./ad-thumb";

export default function AdCard({ ad, rivalName, badge }: { ad: Ad; rivalName?: string; badge?: React.ReactNode }) {
  const days = daysRunningOf(ad);
  return (
    <a href={libraryLink(ad.archive_id)} target="_blank" rel="noreferrer" className="card p-0 overflow-hidden flex flex-col hover:border-amber transition-colors">
      <div className="aspect-square relative">
        <AdThumb src={ad.image_url} label={ad.format} />
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
          {badge}
          {ad.format === "video" && <span className="pill">▶ video</span>}
          {ad.variants > 1 && <span className="pill">{ad.variants} variants</span>}
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex justify-between items-baseline gap-2">
          <span className="font-semibold text-[13.5px] truncate">{rivalName ?? ad.page_name}</span>
          {days !== null && (
            <span className={`mono-label shrink-0 ${days >= 21 ? "text-amber" : ""}`}>{ad.active ? `${days}d running` : `ran ${days}d`}</span>
          )}
        </div>
        {ad.hook && <p className="m-0 text-[14px] font-medium leading-[1.4]">“{ad.hook}”</p>}
        <p className="m-0 text-[13px] text-ink-soft leading-[1.5] line-clamp-4 whitespace-pre-line">{ad.body || ad.title || "No copy"}</p>
        <div className="mt-auto pt-2 flex flex-wrap gap-1.5">
          {ad.angle && <span className="pill">{ad.angle}</span>}
          {ad.offer && ad.offer.toLowerCase() !== "none" && <span className="pill pill-proven">{ad.offer}</span>}
          {ad.cta && <span className="pill">{ad.cta}</span>}
        </div>
      </div>
    </a>
  );
}
