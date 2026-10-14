import { domainOf } from "@/lib/adlibrary/match";
import type { Ad } from "@/lib/db/types";
import { adStage, SCALING_DAYS, SCALING_VERSIONS, TESTING_DAYS, type Stage } from "@/lib/diff";
import { daysRunningOf, libraryLink, tagLabel, todayIso } from "@/lib/format";

import AdPreview from "./ad-preview";
import AdThumb from "./ad-thumb";

export interface AdBadge {
  label: string;
  tone: "pos" | "neg" | "warn" | "info" | "neutral";
  title?: string;
}

const TONE = { pos: "badge badge-pos", neg: "badge badge-neg", warn: "badge badge-warn", info: "badge badge-info", neutral: "badge" } as const;

export const STAGE_BADGE: Record<Stage, AdBadge> = {
  testing: { label: "Testing", tone: "info", title: `Live under ${TESTING_DAYS} days: still being tested` },
  scaling: { label: "Scaling", tone: "pos", title: `Live ${TESTING_DAYS}+ days with ${SCALING_VERSIONS}+ versions, or ${SCALING_DAYS}+ days: they keep funding it` },
  running: { label: "Running", tone: "neutral", title: `Live ${TESTING_DAYS} to ${SCALING_DAYS} days` },
  stopped: { label: "Stopped", tone: "neg", title: "No longer running" },
};



/** One ad: where it is in their process, the ad as it appears in the feed, and what the model read off it. */
export default function AdCard({ ad, rivalName, badge }: { ad: Ad; rivalName?: string; badge?: AdBadge }) {
  const days = daysRunningOf(ad);
  const status = badge ?? STAGE_BADGE[adStage(ad, todayIso())];
  const offer = ad.offer && ad.offer.toLowerCase() !== "none" ? ad.offer : null;
  return (
    <a href={libraryLink(ad.archive_id)} target="_blank" rel="noreferrer" className="card overflow-hidden flex flex-col transition-shadow hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between gap-2 px-3.5 h-11 border-b border-line">
        <span className={TONE[status.tone]} title={status.title}>
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
