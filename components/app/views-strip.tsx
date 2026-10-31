/**
 * The creator's recent videos as a strip of bars, oldest left, on a log scale so
 * one huge video doesn't flatten the rest. A video at twice their usual or more
 * is pink: the breakouts the plan builds on.
 */
export default function ViewsStrip({ views, usual, max = 24 }: { views: (number | null)[]; usual: number | null; max?: number }) {
  const vs = views.filter((v): v is number => v !== null && v > 0).slice(0, max).reverse();
  if (vs.length < 3) return null;
  const top = Math.log10(Math.max(...vs) + 1);
  const floor = Math.log10(Math.min(...vs) + 1) * 0.85;
  return (
    <span className="views-strip mt-2.5" aria-hidden="true">
      {vs.map((v, i) => (
        <i key={i} className={usual && v >= usual * 2 ? "hit" : ""} style={{ height: `${Math.max(12, ((Math.log10(v + 1) - floor) / (top - floor || 1)) * 100)}%` }} />
      ))}
    </span>
  );
}
