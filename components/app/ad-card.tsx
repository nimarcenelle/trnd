import type { Ad } from "@/lib/db/types";
import { PROVEN_DAYS } from "@/lib/diff";
import { daysRunningOf, libraryLink } from "@/lib/format";

import AdThumb from "./ad-thumb";

export interface AdBadge {
  label: string;
  tone: "mint" | "rec" | "amber";
}

const CHIP = { mint: "chip-mint", rec: "chip-rec", amber: "chip-amber" } as const;

/** One rival ad as a camera feed, with what the model read off it underneath. */
export default function AdCard({ ad, rivalName, badge }: { ad: Ad; rivalName?: string; badge?: AdBadge }) {
  const days = daysRunningOf(ad);
  const status: AdBadge = badge ?? (ad.active ? { label: "Live", tone: "mint" } : { label: "Killed", tone: "rec" });
  const offer = ad.offer && ad.offer.toLowerCase() !== "none" ? ad.offer : null;
  return (
    <a
      href={libraryLink(ad.archive_id)}
      target="_blank"
      rel="noreferrer"
      className="panel overflow-hidden flex flex-col transition-colors hover:border-line-2"
    >
      <div className="cam aspect-square">
        <AdThumb src={ad.image_url} label={ad.format} />
        <div className="cam-hud top">
          <span className={`chip ${CHIP[status.tone]}`}>{status.label}</span>
          <span className="chip">
            {ad.format === "video" ? "▶ Video" : ad.format}
            {ad.variants > 1 ? ` · ${ad.variants}×` : ""}
          </span>
        </div>
        <div className="cam-hud bottom">
          <span className="chip truncate max-w-[60%]">{rivalName ?? ad.page_name}</span>
          {days !== null && <span className={`chip ${ad.active && days >= PROVEN_DAYS ? "chip-amber" : ""}`}>{ad.active ? `${days}d live` : `ran ${days}d`}</span>}
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        {ad.hook && <p className="font-semibold text-[14.5px] leading-[1.35]">“{ad.hook}”</p>}
        <p className="text-[13px] text-ink-2 leading-[1.55] line-clamp-3 whitespace-pre-line">{ad.body || ad.title || "No copy"}</p>
        <div className="mt-auto pt-1 flex flex-wrap gap-1.5">
          {ad.angle && <span className="tag">{ad.angle}</span>}
          {offer && <span className="tag tag-amber">{offer}</span>}
        </div>
      </div>
    </a>
  );
}
