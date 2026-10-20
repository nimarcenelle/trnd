"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const WORKING = new Set(["reading", "niche", "idea"]);

/**
 * Drives a preview: asks the server to run the next step, re-renders the page,
 * and goes on to the step after until the preview stops working (ready, waiting
 * for "that's me", or failed). Each step is its own request, so none outlives a
 * function's time limit.
 */
export default function PreviewRunner({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    const run = async () => {
      let last: string | null = null;
      while (live) {
        const res = await fetch(`/api/preview/${id}/step`, { method: "POST" }).catch(() => null);
        const status = res?.ok ? ((await res.json().catch(() => null)) as { status?: string } | null)?.status ?? null : null;
        if (!live) return;
        router.refresh();
        if (status && !WORKING.has(status)) return;
        // Unchanged (another tab holds the step) or a failed request: look again shortly.
        if (status === last || !status) await new Promise((r) => setTimeout(r, 4000));
        last = status;
      }
    };
    void run();
    // Another tab may be running it: show its progress too.
    const timer = setInterval(() => live && router.refresh(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, router]);
  return null;
}
