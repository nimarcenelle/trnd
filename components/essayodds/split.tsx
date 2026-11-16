/** One number split in two: the locked part in ink, the movable part in green. */
export function SplitBar({ locked, movable, className = "" }: { locked: number; movable: number; className?: string }) {
  return (
    <div className={`flex h-1.5 w-full rounded-full overflow-hidden bg-muted ${className}`} aria-label={`${locked}% locked, ${movable}% movable`} role="img">
      <span className="bg-locked" style={{ width: `${locked}%` }} />
      <span className="bg-brand ml-px" style={{ width: `${movable}%` }} />
    </div>
  );
}

/** The two-part legend beside a split bar. */
export function SplitLegend({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 text-[12px] text-ink-3 ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        <i className="w-2 h-2 rounded-[2px] bg-locked" /> Locked
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="w-2 h-2 rounded-[2px] bg-brand" /> Movable
      </span>
    </span>
  );
}
