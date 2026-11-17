import "server-only";

import type { OnEvent, StreamEvent } from "./stream-events";

/** The page asks for a stream with this Accept header; anything else gets the one-shot JSON reply as before. */
export const wantsStream = (request: Request) => request.headers.get("accept")?.includes("application/x-ndjson") ?? false;

/**
 * Runs `work`, sending its events as JSON lines while it goes and the result last. A blank line every 10 seconds keeps
 * the connection open while the model thinks before it writes.
 */
export function streamResponse<T>(work: (send: OnEvent) => Promise<T>, statusFor: (err: unknown) => number): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let open = true;
      const write = (line: string) => {
        if (open) controller.enqueue(encoder.encode(line));
      };
      const send = (e: StreamEvent) => write(JSON.stringify(e) + "\n");
      const beat = setInterval(() => write("\n"), 10_000);
      try {
        send({ type: "done", result: await work(send) });
      } catch (err) {
        send({ type: "error", status: statusFor(err) });
      } finally {
        clearInterval(beat);
        open = false;
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
