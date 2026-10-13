import type { Ad } from "@/lib/db/types";
import { libraryLink } from "@/lib/format";

import AdThumb from "./ad-thumb";

/** The ads behind a claim, as small thumbnails that open in the Ad Library. */
export default function Evidence({ ids, ads, label = "Based on" }: { ids: string[]; ads: Map<string, Ad>; label?: string }) {
  if (!ids.length) return null;
  return (
    <div className="flex items-center gap-2.5 mt-3">
      <span className="caption shrink-0">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {ids.slice(0, 6).map((id) => {
          const ad = ads.get(id);
          return (
            <a
              key={id}
              href={libraryLink(id)}
              target="_blank"
              rel="noreferrer"
              title={ad ? `${ad.page_name ?? ""}${ad.hook ? `: “${ad.hook}”` : ""}` : id}
              className="block w-9 h-9 rounded-md overflow-hidden border border-line hover:border-ink-3 transition-colors"
            >
              <AdThumb src={ad?.image_url ?? null} label="Ad" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
