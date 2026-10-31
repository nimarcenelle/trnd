/**
 * Only a path on this site may follow sign-in. A browser reads `/\evil.com`
 * (and `/<tab>/evil.com`, which it strips to `//evil.com`) as another host, so
 * the path is resolved the way a browser would and must stay on our origin.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  const base = "https://trnd.invalid";
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
