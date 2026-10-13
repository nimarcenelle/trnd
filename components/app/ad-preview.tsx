import Avatar from "./avatar";

/**
 * An ad drawn the way it appears in the Facebook feed: the Page, "Sponsored",
 * the primary text, the creative, and the link bar with its call to action.
 */
export default function AdPreview({
  page,
  body,
  title,
  cta,
  domain,
  media,
}: {
  page: string;
  body: string | null;
  title: string | null;
  cta: string | null;
  domain: string | null;
  media: React.ReactNode;
}) {
  return (
    <div className="bg-bg">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <Avatar name={page} size={32} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight truncate">{page}</div>
          <div className="text-[11.5px] text-ink-3 leading-tight mt-0.5">Sponsored</div>
        </div>
      </div>
      <div className="px-3.5 pt-2.5 pb-3">
        <p className="text-[13px] leading-[1.45] text-ink line-clamp-3 min-h-[4.35em]">{body || " "}</p>
      </div>
      <div className="aspect-square bg-muted border-y border-line overflow-hidden">{media}</div>
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-subtle">
        <div className="min-w-0">
          {domain && <div className="text-[11px] uppercase tracking-wide text-ink-3 truncate">{domain}</div>}
          <div className="text-[13px] font-semibold leading-snug truncate">{title || " "}</div>
        </div>
        {cta && <span className="shrink-0 inline-flex items-center h-7 px-2.5 rounded-md bg-muted text-[12.5px] font-semibold text-ink">{cta}</span>}
      </div>
    </div>
  );
}
