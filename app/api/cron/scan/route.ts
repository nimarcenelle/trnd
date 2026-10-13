import { planState } from "@/lib/billing";
import { adminSupabase } from "@/lib/db/supabase";
import type { Brand } from "@/lib/db/types";
import { env } from "@/lib/env";
import { isScanning } from "@/lib/format";
import { scanBrand } from "@/lib/scan";

/**
 * The daily watch. Called by Vercel Cron with no brand: lists every brand
 * that is due and calls itself once per brand, so each scan gets its own
 * function and its own time limit. Called with ?brand=<id>: scans that one.
 */
export const maxDuration = 300;

/** A brand scanned in the last 20 hours is not due again yet. */
const DUE_AFTER_MS = 20 * 3_600_000;

export async function GET(req: Request): Promise<Response> {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand");
  if (brandId) {
    try {
      return Response.json(await scanBrand(brandId));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  const { data } = await adminSupabase().from("brands").select("*");
  const due = ((data ?? []) as Brand[]).filter(
    (b) =>
      !planState(b).locked &&
      !isScanning(b) &&
      (!b.last_scan_at || Date.now() - Date.parse(b.last_scan_at) > DUE_AFTER_MS),
  );
  const results = await Promise.allSettled(
    due.map((b) =>
      fetch(`${url.origin}${url.pathname}?brand=${b.id}`, { headers: { authorization: `Bearer ${env.cronSecret}` } }).then((r) => r.status),
    ),
  );
  return Response.json({ due: due.length, ok: results.filter((r) => r.status === "fulfilled" && r.value === 200).length });
}
