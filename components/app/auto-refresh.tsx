"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Quietly re-fetches the page while a background job (the founding
 * analysis, the first ranking) is landing — the user never has to reload. */
export default function AutoRefresh({ everyMs = 12000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
