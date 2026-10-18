import { domainOf } from "@/lib/adlibrary/match";
import type { Ad } from "@/lib/db/types";
import { adStage, SCALING_DAYS, SCALING_VERSIONS, TESTING_DAYS, type Stage } from "@/lib/diff";
import { cleanCopy, daysRunningOf, libraryLink, tagLabel, todayIso } from "@/lib/format";
import { angleMeaning, explainScore, scoreVerdict } from "@/lib/insight";
import { tierOf } from "@/lib/score";

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



const PART_LABEL = { longevity: "how long it has run", engagement: "engagement on its organic post", reach: "reach rank", repetition: "versions running", sentiment: "comment sentiment" } as const;

/** The conversion score, with what it was built from on hover. */
export function ScoreBadge({ ad }: { ad: Ad }) {
  const tier = tierOf(ad.score);
  if (!tier || ad.score === null || ad.score === undefined) return null;
  const parts = ad.score_parts;
  const from = parts
    ? (Object.keys(PART_LABEL) as (keyof typeof PART_LABEL)[])
        .filter((k) => parts[k] !== null)
        .map((k) => `${PART_LABEL[k]} ${Math.round((parts[k] as number) * 100)}`)
        .join(", ")
    : "";
  const title = `Conversion score ${ad.score}/100: our estimate of how well this ad works for them.${from ? ` Built from ${from}.` : ""}${
    parts && parts.engagement === null ? " No matching organic post, so no engagement in this one." : ""
  }`;
  return (
    <span className={tier === "top" ? "badge badge-pos" : tier === "weak" ? "badge badge-outline" : "badge"} title={title}>
      Score <span className="tnum font-semibold">{ad.score}</span>
    </span>
  );
}

/**
 * Why the score is what it is, a tap away: the verdict, the signals behind it
 * in plain words, and what the angle tag means. Works on a phone, where a
 * hover title never shows.
 */
function ScoreWhy({ ad, market, versions }: { ad: Ad; market: Ad[]; versions: number }) {
  if (ad.score === null || ad.score === undefined) return null;
  const reasons = explainScore(ad, market, versions);
  const angle = angleMeaning(ad.angle);
  return (
    <details className="group border-t border-line">
      <summary className="px-3.5 py-2.5 text-[12.5px] text-ink-2 hover:text-ink cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
        <span className="transition-transform group-open:rotate-90">›</span> Why it scores {ad.score}
      </summary>
      <div className="px-3.5 pb-3.5 text-[12.5px] leading-[1.5]">
        <p className="m-0 font-medium">{scoreVerdict(ad.score)}</p>
        <ul className="m-0 mt-1.5 pl-4 list-disc flex flex-col gap-1 text-ink-2">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {angle && ad.angle && (
          <p className="m-0 mt-2 text-ink-2">
            <span className="font-medium text-ink">{tagLabel(ad.angle)}:</span> {angle}
          </p>
        )}
        <p className="m-0 mt-2 caption">
          The score (0-100) estimates how well an ad works for the brand running it. Meta shows no spend or sales, so it is built from what we can see: how long it runs, its versions, its reach rank and its organic post.
        </p>
      </div>
    </details>
  );
}

/**
 * One ad: where it is in their process, the ad as it appears in the feed
 * (opens in the Ad Library), what the model read off it, and why it scores
 * what it does. `market`: the ads its score is compared against.
 */
export default function AdCard({ ad, rivalName, badge, versions = 1, market = [] }: { ad: Ad; rivalName?: string; badge?: AdBadge; versions?: number; market?: Ad[] }) {
  const days = daysRunningOf(ad);
  const status = badge ?? STAGE_BADGE[adStage(ad, todayIso())];
  const offer = ad.offer && ad.offer.toLowerCase() !== "none" ? ad.offer : null;
  return (
    <div className="card overflow-hidden flex flex-col">
      <a href={libraryLink(ad.archive_id)} target="_blank" rel="noreferrer" className="block transition-opacity hover:opacity-90" title="Open in the Ad Library">
        <div className="flex items-center justify-between gap-2 px-3.5 h-11 border-b border-line">
          <span className={TONE[status.tone]} title={status.title}>
            <span className="status-dot" />
            {status.label}
          </span>
          <span className="text-[12px] text-ink-3 tnum">
            {/* Versions: the ads carrying this copy, or the variants Meta reports for the one ad, whichever says more. */}
            {Math.max(versions, ad.variants) > 1 && <span title="Ads running this same copy, counting Meta's own variants">{Math.max(versions, ad.variants)} versions · </span>}
            {days !== null && (ad.active ? `${days} days` : `Ran ${days} days`)}
          </span>
        </div>
        <AdPreview
          page={rivalName ?? ad.page_name ?? "Advertiser"}
          body={cleanCopy(ad.body)}
          title={cleanCopy(ad.title)}
          cta={ad.cta}
          domain={domainOf(ad.link_url)}
          media={<AdThumb src={ad.image_url} label={ad.format} />}
        />
      </a>
      {(ad.angle || offer || ad.hook || tierOf(ad.score)) && (
        <div className="px-3.5 py-3 border-t border-line flex flex-col gap-2 mt-auto">
          {ad.hook && <p className="text-[12.5px] text-ink-2 leading-snug">Hook: “{ad.hook}”</p>}
          <div className="flex flex-wrap gap-1.5">
            <ScoreBadge ad={ad} />
            {ad.angle && (
              <span className="badge badge-outline" title={angleMeaning(ad.angle) ?? undefined}>
                {tagLabel(ad.angle)}
              </span>
            )}
            {offer && <span className="badge badge-outline">{offer}</span>}
          </div>
        </div>
      )}
      <ScoreWhy ad={ad} market={market} versions={versions} />
    </div>
  );
}
