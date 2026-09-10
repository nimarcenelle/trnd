"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Quietly re-fetches the page while a background job (the founding
 * analysis, the first ranking, this week's written note) is landing — the
 * user never has to reload. `times` bounds the polling: a job that failed
 * server-side never lands, and a page that polls forever is a battery leak
 * nobody sees. */
export default function AutoRefresh({ everyMs = 12000, times = Infinity }: { everyMs?: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let left = times;
    const id = setInterval(() => {
      router.refresh();
      if (--left <= 0) clearInterval(id);
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, times]);
  return null;
}
