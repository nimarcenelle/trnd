import type { Review } from "./review-core";

/** What a streamed review or rewrite sends to the page, one JSON object per line. */
export type LiveNote = { quote?: string; problem?: string; fix?: string };
export type StreamEvent<T = unknown> =
  | { type: "notes"; notes: LiveNote[] }
  | { type: "rewrite"; text: string }
  | { type: "phase"; label: string }
  | { type: "done"; result: T }
  | { type: "error"; status: number };
export type OnEvent = (e: StreamEvent) => void;
export type ReviewDone = StreamEvent<Review>;

/** Calls `fn` at most every `ms`, always with the latest value, and once more at the end via `flush`. */
export function throttled<A>(fn: (a: A) => void, ms = 120) {
  let last = 0;
  let pending: A | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (pending === undefined) return;
    last = Date.now();
    const a = pending;
    pending = undefined;
    fn(a);
  };
  return {
    push(a: A) {
      pending = a;
      if (Date.now() - last >= ms) run();
      else if (!timer) timer = setTimeout(() => ((timer = undefined), run()), ms);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      run();
    },
  };
}
