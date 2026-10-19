"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Drives a preview: asks the server to run the next step, then re-renders the
 * page. Each step is its own request, so none outlives a function's time limit.
 */
export default function PreviewRunner({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    const tick = async () => {
      await fetch(`/api/preview/${id}/step`, { method: "POST" }).catch(() => null);
      if (live) router.refresh();
    };
    void tick();
    // Another tab or a slow step may be running it: look again every few seconds.
    const timer = setInterval(() => live && router.refresh(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, router]);
  return null;
}
