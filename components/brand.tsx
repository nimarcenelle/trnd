import Link from "next/link";

/**
 * The TRND wordmark, matched to the logo: sage-mint dot, wide-tracked
 * geometric caps in warm off-white (ink). One component so every surface
 * renders the identical mark.
 */
export default function Brand({
  href = "/",
  size = 17,
}: {
  href?: string | null;
  size?: number;
}) {
  const mark = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.62),
        fontFamily: "var(--disp)",
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "0.22em",
        color: "var(--ink)",
        lineHeight: 1,
      }}
    >
      <i
        aria-hidden="true"
        style={{
          width: Math.round(size * 0.5),
          height: Math.round(size * 0.5),
          borderRadius: "50%",
          background: "var(--mint)",
          flex: "0 0 auto",
        }}
      />
      <span style={{ transform: "translateY(0.5px)" }}>TRND</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link className="inline-flex" href={href} aria-label="TRND home">
      {mark}
    </Link>
  );
}
