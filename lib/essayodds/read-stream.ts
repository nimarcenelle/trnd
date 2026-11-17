import type { StreamEvent } from "./stream-events";

/**
 * Posts and reads a streamed reply line by line. Returns the result, or the HTTP status when the request failed before
 * streaming (payment, limits, length) or an error event arrived mid-way.
 */
export async function postStream<T>(path: string, body: object, onEvent: (e: StreamEvent) => void): Promise<{ result: T } | { status: number }> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { status: 0 };
  if (!res.ok || !res.body) return { status: res.status };
  // Saved results come back as plain JSON when the server answers before streaming starts.
  if (!res.headers.get("content-type")?.includes("ndjson")) return { result: (await res.json()) as T };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "done") return { result: event.result as T };
      if (event.type === "error") return { status: event.status };
      onEvent(event);
    }
    if (done) return { status: 500 };
  }
}
