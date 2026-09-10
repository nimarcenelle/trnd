/**
 * "↑22%" — the movement, as a number. It used to link to Google Trends, but
 * a read that had to widen to land ("bike chain" for "bike chain cleaning")
 * opens a page about a different term, which proves nothing and reads as a
 * dodge. The source badge beside it still says where the read came from.
 */
export default function DeltaChip({
  delta,
  suffix,
}: {
  delta: number;
  /** Trailing text inside the chip, e.g. "this week" or "· 30d". */
  suffix?: string;
}) {
  const down = delta < 0;
  const label = `${down ? "↓" : "↑"}${Math.abs(Math.round(delta))}%${suffix ? ` ${suffix}` : ""}`;
  return <span className={`delta-chip${down ? " delta-chip--down" : ""}`}>{label}</span>;
}
