import Link from "next/link";

import { IconGlobe, IconMail } from "@/components/icons";
import type { Ad } from "@/lib/db/types";
import { libraryLink } from "@/lib/format";

import AdThumb from "./ad-thumb";

/** A website change or an email a claim rests on, keyed "site:<id>" or "email:<id>". */
export interface SignalRef {
  kind: "site" | "email";
  title: string;
  href: string | null;
}

const box = "block w-9 h-9 rounded-md overflow-hidden border border-line hover:border-ink-3 transition-colors";

/** The signals behind a claim: ad thumbnails that open in the Ad Library, website changes and emails. */
export default function Evidence({ ids, ads, refs, label = "Based on" }: { ids: string[]; ads: Map<string, Ad>; refs?: Map<string, SignalRef>; label?: string }) {
  if (!ids.length) return null;
  return (
    <div className="flex items-center gap-2.5 mt-3">
      <span className="caption shrink-0">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {ids.slice(0, 8).map((id) => {
          if (id.startsWith("site:") || id.startsWith("email:")) {
            const ref = refs?.get(id);
            const Icon = id.startsWith("site:") ? IconGlobe : IconMail;
            const chip = <span className={`${box} grid place-items-center bg-subtle text-ink-2`}>{<Icon />}</span>;
            if (!ref?.href) return <span key={id} title={ref?.title ?? (id.startsWith("site:") ? "Website change" : "Email")}>{chip}</span>;
            return ref.kind === "site" ? (
              <a key={id} href={ref.href} target="_blank" rel="noreferrer" title={ref.title}>
                {chip}
              </a>
            ) : (
              <Link key={id} href={ref.href} title={ref.title}>
                {chip}
              </Link>
            );
          }
          const ad = ads.get(id);
          return (
            <a key={id} href={libraryLink(id)} target="_blank" rel="noreferrer" title={ad ? `${ad.page_name ?? ""}${ad.hook ? `: “${ad.hook}”` : ""}` : id} className={box}>
              <AdThumb src={ad?.image_url ?? null} label="Ad" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
