"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches server data on an interval — for screens waiting on a
 * background job (e.g. the founding analysis) to land. */
export default function AutoRefresh({ everyMs = 6000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const iv = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(iv);
  }, [router, everyMs]);
  return null;
}