import Link from "next/link";

/** The TRND wordmark, as in the logo: a teal dot and wide-tracked caps. */
export default function Brand({ href = "/", size = 15 }: { href?: string | null; size?: number }) {
  const mark = (
    <span className="inline-flex items-center text-ink" style={{ gap: Math.round(size * 0.55), fontFamily: "var(--logo)", fontWeight: 500, fontSize: size, letterSpacing: "0.3em", lineHeight: 1 }}>
      <i aria-hidden="true" style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46), borderRadius: "50%", background: "var(--brand)" }} />
      <span style={{ marginRight: "-0.3em" }}>TRND</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link className="inline-flex" href={href} aria-label="TRND home">
      {mark}
    </Link>
  );
}
