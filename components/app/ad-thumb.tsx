"use client";

import { useState } from "react";

/**
 * The ad's creative. Ad Library media URLs are signed and expire after a few
 * days, so a broken image falls back to the format label; the link to the
 * library always works.
 */
export default function AdThumb({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <div className="w-full h-full grid place-items-center bg-bg-2 mono-label">{label}</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={() => setBroken(true)} />;
}
