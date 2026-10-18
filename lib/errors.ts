/**
 * Error reporting to Sentry, without the SDK: one event per error, posted to
 * the DSN's envelope endpoint. No SENTRY_DSN, no reporting (errors still go to
 * the logs). Used by the app (instrumentation.ts), the scan and the worker.
 */

type Extra = Record<string, unknown>;

/** "https://KEY@o1.ingest.sentry.io/123" → the envelope URL, or null. */
export function envelopeUrl(dsn: string): string | null {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\//, "");
    if (!u.username || !project) return null;
    return `${u.protocol}//${u.host}/api/${project}/envelope/?sentry_key=${u.username}&sentry_version=7`;
  } catch {
    return null;
  }
}

/** The envelope Sentry expects: a header line, an item header, the event. */
export function envelope(dsn: string, err: unknown, extra: Extra = {}, now = new Date()): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? "development",
    server_name: process.env.RAILWAY_SERVICE_NAME ? "worker" : "app",
    exception: { values: [{ type: e.name || "Error", value: e.message.slice(0, 2000) }] },
    tags: Object.fromEntries(Object.entries(extra).filter(([, v]) => typeof v === "string" && (v as string).length < 200)),
    extra: { ...extra, stack: e.stack?.slice(0, 8000) },
  };
  return `${JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
}

export async function captureError(err: unknown, extra: Extra = {}): Promise<void> {
  console.error("[error]", (err as Error)?.message ?? err, extra);
  const dsn = process.env.SENTRY_DSN;
  const url = dsn ? envelopeUrl(dsn) : null;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope" },
    body: envelope(dsn!, err, extra),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}
