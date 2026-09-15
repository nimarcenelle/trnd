import { NextResponse, type NextRequest } from "next/server";

import { env, isDataForSeoConfigured, isRedditConfigured } from "@/lib/env";

/**
 * A window onto the upstream sources, from production, with the keys only
 * production has. Every reader here degrades quietly by design (a failed
 * read is a warning and an empty list), and there is no log to read on
 * this host, so when a source writes nothing the only way to see why was
 * to guess. This answers "what did DataForSEO actually say" for one term,
 * raw and truncated. Cron-secret only; never linked from the app.
 *
 *   GET /api/admin/probe?what=dfs-trends&term=hard%20water
 *   GET /api/admin/probe?what=dfs-related&term=hard%20water
 *   GET /api/admin/probe?what=reddit&term=hard%20water
 *   GET /api/admin/probe?what=apify
 */
export const maxDuration = 60;

const MAX_BODY = 6000;

async function dfs(path: string, body: unknown): Promise<{ status: number; body: string; full: string }> {
  const auth = Buffer.from(`${env.dataForSeoLogin}:${env.dataForSeoPassword}`).toString("base64");
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify([body]),
    signal: AbortSignal.timeout(45_000),
  });
  const full = await res.text();
  return { status: res.status, body: full.slice(0, MAX_BODY), full };
}

export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const what = request.nextUrl.searchParams.get("what") ?? "";
  const term = (request.nextUrl.searchParams.get("term") ?? "hard water").slice(0, 80);
  const started = Date.now();
  try {
    // What one brand's week cost, or the whole account's: model tokens and
    // paid provider calls, estimated from public rates and labeled so.
    if (what === "usage") {
      const business = request.nextUrl.searchParams.get("business") ?? undefined;
      const days = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? "7") || 7));
      const { getAdminRepo } = await import("@/lib/db/admin");
      const { summarizeUsage } = await import("@/lib/ai/usage");
      const { summarizeProviderUsage } = await import("@/lib/usage/providers");
      const repo = getAdminRepo();
      const [ai, providers] = await Promise.all([
        repo.listAiUsage({ sinceHours: days * 24, businessId: business }),
        repo.listProviderUsage({ sinceHours: days * 24, businessId: business }),
      ]);
      const failures = providers.filter((r) => !r.ok).slice(0, 25).map((r) => ({ at: r.created_at, provider: r.provider, operation: r.operation, purpose: r.purpose, note: r.note }));
      return NextResponse.json({
        what,
        business: business ?? "all",
        days,
        model: summarizeUsage(ai),
        providers: summarizeProviderUsage(providers),
        failures,
        note: "Provider costs are estimates from public rates (lib/usage/providers.ts RATES); model usage is tokens, not dollars. No billed figure is on file.",
        ms: Date.now() - started,
      });
    }
    if (what === "dfs-trends") {
      if (!isDataForSeoConfigured) return NextResponse.json({ what, configured: false });
      const raw = await dfs("keywords_data/google_trends/explore/live", {
        keywords: [term],
        location_code: 2840,
        language_code: "en",
        time_range: "past_90_days",
        item_types: ["google_trends_graph", "google_trends_queries_list"],
      });
      const { mapTrendsExplore } = await import("@/lib/signals/adapters/trends-dfs");
      let mapped: unknown = null;
      try {
        const data = JSON.parse(raw.full) as { tasks?: { result?: unknown; status_message?: string; status_code?: number }[] };
        const t = data.tasks?.[0];
        const read = mapTrendsExplore(t?.result, "US");
        mapped = { taskStatus: t?.status_code, taskMessage: t?.status_message, seriesTerms: [...read.series.keys()], points: [...read.series.values()].map((p) => p.length), rising: Object.fromEntries(read.rising) };
      } catch (err) {
        mapped = { parseError: (err as Error).message };
      }
      return NextResponse.json({ what, term, ms: Date.now() - started, status: raw.status, body: raw.body, mapped });
    }
    if (what === "dfs-related") {
      if (!isDataForSeoConfigured) return NextResponse.json({ what, configured: false });
      const raw = await dfs("keywords_data/google_ads/keywords_for_keywords/live", {
        keywords: [term],
        location_code: 2840,
        language_code: "en",
        sort_by: "search_volume",
        include_adult_keywords: false,
      });
      return NextResponse.json({ what, term, ms: Date.now() - started, status: raw.status, body: raw.body });
    }
    if (what === "reddit") {
      const { createRedditAdapter } = await import("@/lib/signals/adapters/reddit");
      const rows = await createRedditAdapter().fetch({ terms: [], watch: [{ term, category: "probe", geo: "US" }], subreddits: [], geo: "US", windowDays: 7 });
      return NextResponse.json({ what, term, configured: isRedditConfigured, ms: Date.now() - started, rows: rows.length, sample: rows.slice(0, 3) });
    }
    if (what === "apify") {
      const res = await fetch(`https://api.apify.com/v2/users/me/limits?token=${encodeURIComponent(env.apifyToken)}`, { signal: AbortSignal.timeout(10_000) });
      return NextResponse.json({ what, ms: Date.now() - started, status: res.status, body: (await res.text()).slice(0, MAX_BODY) });
    }
    return NextResponse.json({ error: "what must be dfs-trends, dfs-related, reddit or apify" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ what, term, error: (err as Error).message, ms: Date.now() - started }, { status: 500 });
  }
}
