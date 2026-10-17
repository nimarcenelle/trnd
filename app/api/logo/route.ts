import { bestIcon } from "@/lib/logo";
import { get } from "@/lib/site";

/**
 * A company's logo by domain, fetched here and cached for a week at the edge,
 * so pages load it from us (fast, and visitors' browsers never call a third
 * party). In order: the best icon its homepage declares (apple touch icon,
 * else the largest), then Google's 128px favicon. A 404 when there's none;
 * the app then shows the company's initial.
 */

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const WEEK = "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";

async function image(url: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  // A site picks its icon's address: only public hostnames, never an IP or localhost.
  const host = new URL(url).hostname;
  if (!host.includes(".") || /^[\d.]+$|^\[|localhost|\.internal$|\.local$/i.test(host)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store", redirect: "follow" }).catch(() => null);
  const type = res?.headers.get("content-type")?.split(";")[0] ?? "";
  if (!res || !res.ok || !type.startsWith("image/")) return null;
  const bytes = await res.arrayBuffer();
  // Tiny files are blank or 1px trackers; huge ones aren't icons.
  return bytes.byteLength > 100 && bytes.byteLength < 1_000_000 ? { bytes, type } : null;
}

export async function GET(req: Request): Promise<Response> {
  const d = (new URL(req.url).searchParams.get("d") ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!DOMAIN.test(d)) return new Response("bad domain", { status: 400 });

  const home = await get(`https://${d}`);
  const declared = home ? bestIcon(home, `https://${d}/`) : null;
  const found =
    (declared ? await image(declared) : null) ?? (await image(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`));
  if (!found) return new Response("no logo", { status: 404, headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } });
  return new Response(found.bytes, { headers: { "content-type": found.type, "cache-control": WEEK } });
}
