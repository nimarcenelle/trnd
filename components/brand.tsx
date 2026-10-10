import Link from "next/link";

/**
 * The TRND wordmark, matched to the logo: the dot is the recording light
 * (pulsing when `live`), sage-mint, wide-tracked
 * geometric caps in warm off-white (ink). One component so every surface
 * renders the identical mark.
 */
export default function Brand({
  href = "/",
  size = 17,
  live = false,
}: {
  href?: string | null;
  size?: number;
  /** The dot as a recording light: it pulses while TRND is watching. */
  live?: boolean;
}) {
  const mark = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.62),
        fontFamily: "var(--logo, var(--disp))",
        fontWeight: 500,
        fontSize: size * 1.15,
        letterSpacing: "0.3em",
        color: "var(--ink)",
        lineHeight: 1,
      }}
    >
      <i
        aria-hidden="true"
        className={live ? "brand-rec" : undefined}
        style={{
          width: Math.round(size * 0.5),
          height: Math.round(size * 0.5),
          borderRadius: "50%",
          background: "var(--brand-dot, var(--mint))",
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
