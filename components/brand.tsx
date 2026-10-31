import Link from "next/link";

/** The wordmark: TRND in Unbounded, a pink period, and "for creators" beside it. */
export default function Brand({ href = "/", size = 18, sub = true }: { href?: string | null; size?: number; sub?: boolean }) {
  const mark = (
    <span className="inline-flex items-baseline whitespace-nowrap" style={{ fontFamily: "var(--logo)", fontWeight: 800, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1 }}>
      TRND<span className="text-brand">.</span>
      {sub && (
        <span className="text-ink-2" style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: Math.round(size * 0.66), letterSpacing: 0, marginLeft: Math.round(size * 0.3) }}>
          for creators
        </span>
      )}
    </span>
  );
  if (!href) return mark;
  return (
    <Link className="inline-flex" href={href} aria-label="TRND for creators home">
      {mark}
    </Link>
  );
}
