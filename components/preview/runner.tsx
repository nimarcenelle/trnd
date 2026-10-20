"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { stepUntilDone } from "@/lib/preview/steps";

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
    void stepUntilDone({
      step: async () => {
        const res = await fetch(`/api/preview/${id}/step`, { method: "POST" }).catch(() => null);
        return res?.ok ? ((await res.json().catch(() => null)) as { status?: string } | null)?.status ?? null : null;
      },
      refresh: () => router.refresh(),
      wait: () => new Promise((r) => setTimeout(r, 4000)),
      live: () => live,
    });
    // Another tab may be running it: show its progress too.
    const timer = setInterval(() => live && router.refresh(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, router]);
  return null;
}
