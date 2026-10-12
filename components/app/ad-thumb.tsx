"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The ad's creative. Ad Library media URLs are signed and expire after a few
 * days, so a broken image falls back to a quiet placeholder; the link to the
 * library always works.
 */
export default function AdThumb({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError: check on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [src]);
  if (!src || broken) {
    return (
      <div className="cam-fill grid place-items-center bg-bg-3">
        <span className="label">{label}</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}
