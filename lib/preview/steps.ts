/** Statuses a preview is still working through; anything else ends the loop. */
const WORKING = new Set(["reading", "niche", "idea"]);

/**
 * Runs a preview's steps one after another until it stops working (ready,
 * waiting for "that's me", or failed). A status that didn't change (another
 * tab holds the step) or a failed request (null) waits before trying again.
 */
export async function stepUntilDone(o: { step: () => Promise<string | null>; refresh: () => void; wait: () => Promise<void>; live: () => boolean }): Promise<void> {
  let last: string | null = null;
  while (o.live()) {
    const status = await o.step();
    if (!o.live()) return;
    o.refresh();
    if (status && !WORKING.has(status)) return;
    if (status === last || !status) await o.wait();
    last = status;
  }
}
