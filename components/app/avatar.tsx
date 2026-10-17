"use client";

import { useEffect, useRef, useState } from "react";

import { useLogoDomain } from "./logos";

/**
 * A company's logo (its site icon, through /api/logo), or its initial in a
 * muted circle when it has none; the circle's color is stable per name.
 * Pass `domain`, or render inside <LogoProvider> and it's found by name.
 */
const TONES = ["#e8e1d6", "#dde5ea", "#e3e8dc", "#ebdfe2", "#e2e0ec", "#ece5d3", "#d9e7e3"];
const INKS = ["#5c4a33", "#34505f", "#45573a", "#6a3d47", "#47406b", "#66532a", "#2f5c52"];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export default function Avatar({ name, size = 28, domain }: { name: string; size?: number; domain?: string | null }) {
  const known = useLogoDomain(name);
  const d = domain ?? known;
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError: check on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [d]);

  if (d && !broken) {
    return (
      <span aria-hidden="true" className="inline-grid place-items-center rounded-full bg-white border border-line overflow-hidden shrink-0" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={ref}
          src={`/api/logo?d=${encodeURIComponent(d)}`}
          alt=""
          loading="lazy"
          width={size}
          height={size}
          className="block w-[78%] h-[78%] object-contain"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  const i = hash(name) % TONES.length;
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-full font-semibold shrink-0"
      style={{ width: size, height: size, background: TONES[i], color: INKS[i], fontSize: Math.round(size * 0.42) }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
