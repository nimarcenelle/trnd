import type { Ad } from "@/lib/db/types";
import { libraryLink } from "@/lib/format";

import AdThumb from "./ad-thumb";

/** The ads behind a claim, as a strip of small frames that open in the Ad Library. */
export default function Evidence({ ids, ads, label = "Evidence" }: { ids: string[]; ads: Map<string, Ad>; label?: string }) {
  if (!ids.length) return null;
  return (
    <div className="flex items-center gap-3 mt-4">
      <span className="label !text-[10px] shrink-0">{label}</span>
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
              className="cam cam-sm block w-10 h-[50px] rounded-[5px] ring-1 ring-line hover:ring-mint transition-shadow"
            >
              <AdThumb src={ad?.image_url ?? null} label="ad" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
