import Link from "next/link";

/** The TRND wordmark, matched to the logo: a mint dot (the live light) and wide-tracked caps. */
export default function Brand({ href = "/", size = 16, live = false }: { href?: string | null; size?: number; live?: boolean }) {
  const mark = (
    <span className="inline-flex items-center" style={{ gap: Math.round(size * 0.6), fontFamily: "var(--logo)", fontWeight: 500, fontSize: size * 1.12, letterSpacing: "0.32em", lineHeight: 1 }}>
      <i
        aria-hidden="true"
        className={live ? "brand-rec" : undefined}
        style={{ width: Math.round(size * 0.48), height: Math.round(size * 0.48), borderRadius: "50%", background: "var(--mint)", boxShadow: "0 0 12px var(--mint)" }}
      />
      <span style={{ marginRight: "-0.32em" }}>TRND</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link className="inline-flex" href={href} aria-label="TRND home">
      {mark}
    </Link>
  );
}
