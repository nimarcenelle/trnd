/**
 * Look like a browser that has been to Facebook before. A request with no
 * cookies from a cloud server is the clearest sign of a bot, and that is
 * when Meta shows the login wall. So before reading the Ad Library we visit
 * it once, keep the cookies it sets (and the `datr` its page sets from
 * script, which a plain fetch never runs), and send them with every read,
 * along with the client hints Chrome sends.
 */

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** What Chrome 140 on a Mac sends with a page load. */
export const BROWSER_HEADERS: Record<string, string> = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "max-age=0",
  "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

/** name=value pairs from Set-Cookie headers. */
export function parseSetCookies(headers: string[]): [string, string][] {
  return headers.flatMap((h) => {
    const pair = h.split(";")[0];
    const i = pair.indexOf("=");
    if (i <= 0) return [];
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    return value && value !== "deleted" ? [[name, value] as [string, string]] : [];
  });
}

/** The `datr` cookie Facebook's page sets from script: `["_js_datr","VALUE",...]`. */
export function jsDatr(html: string): string | null {
  return html.match(/"_js_datr","([^"]+)"/)?.[1] ?? null;
}

export class CookieJar {
  private cookies = new Map<string, string>();
  private warmedAt = 0;

  get warm(): boolean {
    return this.cookies.size > 0 && Date.now() - this.warmedAt < 30 * 60_000;
  }

  take(res: Response, html?: string) {
    const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const [k, v] of parseSetCookies(set)) this.cookies.set(k, v);
    const datr = html ? jsDatr(html) : null;
    if (datr && !this.cookies.has("datr")) this.cookies.set("datr", datr);
  }

  markWarm() {
    this.warmedAt = Date.now();
  }

  reset() {
    this.cookies.clear();
    this.warmedAt = 0;
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
