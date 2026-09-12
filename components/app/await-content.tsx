"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Waits for a pick's written content, then refreshes the page once.
 *
 * The old AutoRefresh re-rendered the whole server component every six
 * seconds until the read and the ad showed up. `router.refresh()` repaints
 * everything, so an owner reading the page watched it scrub and reload on a
 * timer — and all but the last of those refreshes had nothing new to paint.
 *
 * So: poll a two-boolean endpoint that does no rendering and no AI work,
 * and call refresh exactly once, when something actually landed. Polling
 * backs off, stops when the tab is hidden, and gives up after a couple of
 * minutes — a generation that died server-side never lands, and a page that
 * polls forever is a battery leak nobody sees.
 */
export default function AwaitContent({
  opportunityId,
  /** What we are still missing — polling stops once these are satisfied. */
  needsRead,
  needsCampaign,
}: {
  opportunityId: string;
  needsRead: boolean;
  needsCampaign: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!needsRead && !needsCampaign) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 3000;
    const giveUpAt = Date.now() + 150_000;

    const tick = async () => {
      if (stopped) return;
      if (Date.now() > giveUpAt) return;
      // A hidden tab is not waiting for anything; check again when it is back.
      if (document.visibilityState === "hidden") {
        timer = setTimeout(tick, 5000);
        return;
      }
      try {
        const res = await fetch(`/api/pick-status?opportunity=${encodeURIComponent(opportunityId)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as { read?: boolean; campaign?: boolean };
          const ready = (!needsRead || body.read) && (!needsCampaign || body.campaign);
          if (ready) {
            // The one repaint that has something to show.
            router.refresh();
            return;
          }
        }
      } catch {
        /* offline or a blip — just try again on the next tick */
      }
      // Ease off: a generation that takes a minute should not be asked
      // twenty times about it.
      delay = Math.min(delay * 1.4, 15_000);
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [router, opportunityId, needsRead, needsCampaign]);

  return null;
}
