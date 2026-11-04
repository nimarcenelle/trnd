import Link from "next/link";

/** The Admitted wordmark: a muted-green dot and the name in Inter 600, in ink. */
export default function Brand({ href = "/", size = 15 }: { href?: string | null; size?: number }) {
  const mark = (
    <span className="inline-flex items-center text-ink" style={{ gap: Math.round(size * 0.45), fontWeight: 600, fontSize: size * 1.1, letterSpacing: "-0.02em", lineHeight: 1 }}>
      <i aria-hidden="true" style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46), borderRadius: "50%", background: "var(--brand)" }} />
      <span>Admitted</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link className="inline-flex" href={href} aria-label="Admitted home">
      {mark}
    </Link>
  );
}
