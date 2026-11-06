"use client";

import { useState } from "react";

/** A video cover that takes itself out when its link has expired, rather than show a broken image. */
export default function Cover({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="aspect-[9/16] w-full object-cover rounded-[10px] border border-line bg-muted" />;
}
