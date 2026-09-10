/**
 * "↑22%" — and, whenever the read came from somewhere the owner can open,
 * a link straight to it. A number with no source is just a claim.
 */
export default function DeltaChip({
  delta,
  suffix,
  href,
  title,
}: {
  delta: number;
  /** Trailing text inside the chip, e.g. "this week" or "· 30d". */
  suffix?: string;
  href?: string | null;
  title?: string;
}) {
  const down = delta < 0;
  const label = `${down ? "↓" : "↑"}${Math.abs(Math.round(delta))}%${suffix ? ` ${suffix}` : ""}`;
  const cls = `delta-chip${down ? " delta-chip--down" : ""}`;
  if (!href) return <span className={cls}>{label}</span>;
  return (
    <a
      className={`${cls} delta-chip--link`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title ?? "See this read at the source"}
    >
      {label}
      <span className="src-arrow" aria-hidden="true">↗</span>
    </a>
  );
}
