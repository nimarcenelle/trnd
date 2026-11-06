import Link from "next/link";

/**
 * The TRND wordmark, as on usetrnd.com: a green dot and wide-tracked caps in
 * Jost. "for creators" beside it in Inter, ink-2: one brand, not two.
 */
export default function Brand({ href = "/", size = 15, sub = true }: { href?: string | null; size?: number; sub?: boolean }) {
  const mark = (
    <span className="inline-flex items-center whitespace-nowrap text-ink" style={{ gap: Math.round(size * 0.55), lineHeight: 1 }}>
      <i aria-hidden="true" style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46), borderRadius: "50%", background: "var(--brand)" }} />
      <span style={{ fontFamily: "var(--logo)", fontWeight: 500, fontSize: size, letterSpacing: "0.3em", marginRight: "-0.3em" }}>TRND</span>
      {sub && (
        <span className="text-ink-2" style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: Math.round(size * 0.9), marginLeft: Math.round(size * 0.35) }}>
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
