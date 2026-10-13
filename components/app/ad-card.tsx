import type { Ad } from "@/lib/db/types";
import { PROVEN_DAYS } from "@/lib/diff";
import { daysRunningOf, libraryLink, tagLabel } from "@/lib/format";
import { domainOf } from "@/lib/adlibrary/match";

import AdPreview from "./ad-preview";
import AdThumb from "./ad-thumb";

export interface AdBadge {
  label: string;
  tone: "pos" | "neg" | "warn" | "neutral";
}

const TONE = { pos: "badge badge-pos", neg: "badge badge-neg", warn: "badge badge-warn", neutral: "badge" } as const;

/** One rival ad: how long it has run, the ad as it appears in the feed, and what the model read off it. */
export default function AdCard({ ad, rivalName, badge }: { ad: Ad; rivalName?: string; badge?: AdBadge }) {
  const days = daysRunningOf(ad);
  const proven = ad.active && days !== null && days >= PROVEN_DAYS;
  const status: AdBadge = badge ?? (ad.active ? (proven ? { label: "Proven", tone: "warn" } : { label: "Active", tone: "pos" }) : { label: "Stopped", tone: "neg" });
  const offer = ad.offer && ad.offer.toLowerCase() !== "none" ? ad.offer : null;
  return (
    <a href={libraryLink(ad.archive_id)} target="_blank" rel="noreferrer" className="card overflow-hidden flex flex-col transition-shadow hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between gap-2 px-3.5 h-11 border-b border-line">
        <span className={TONE[status.tone]}>
          <span className="status-dot" />
          {status.label}
        </span>
        <span className="text-[12px] text-ink-3 tnum">
          {days !== null && (ad.active ? `${days} days` : `Ran ${days} days`)}
          {ad.variants > 1 && ` · ${ad.variants} versions`}
        </span>
      </div>
      <AdPreview
        page={rivalName ?? ad.page_name ?? "Advertiser"}
        body={ad.body}
        title={ad.title}
        cta={ad.cta}
        domain={domainOf(ad.link_url)}
        media={<AdThumb src={ad.image_url} label={ad.format} />}
      />
      {(ad.angle || offer || ad.hook) && (
        <div className="px-3.5 py-3 border-t border-line flex flex-col gap-2 mt-auto">
          {ad.hook && <p className="text-[12.5px] text-ink-2 leading-snug">Hook: “{ad.hook}”</p>}
          <div className="flex flex-wrap gap-1.5">
            {ad.angle && <span className="badge badge-outline">{tagLabel(ad.angle)}</span>}
            {offer && <span className="badge badge-outline">{offer}</span>}
          </div>
        </div>
      )}
    </a>
  );
}
