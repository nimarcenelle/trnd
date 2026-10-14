import "server-only";

import { createHash } from "node:crypto";

import { adminSupabase } from "@/lib/db/supabase";
import type { Ad, Landscape, Opportunity } from "@/lib/db/types";
import { daysRunning } from "@/lib/diff";
import { env, isModelConfigured } from "@/lib/env";
import { runPipeline } from "@/lib/pipeline";
import { normalizeUrl } from "@/lib/site";

/**
 * The free report on the home page: one read of a business and its top
 * competitors, no account. Smaller than a scan (five rivals, their
 * longest-running ads) so it is quick and cheap, cached a week per site, and
 * limited per visitor and per day so it can't run up the model bill.
 */

export const PREVIEW_RIVALS = 5;
const TAG_PER_COMPANY = 15;
const REUSE_DONE_MS = 7 * 86_400_000;
/** A run still "running" after this died with its function. */
export const STALE_MS = 8 * 60_000;
const PER_VISITOR_PER_DAY = 3;

export interface PreviewCompany {
  name: string;
  website: string;
  pageName: string | null;
  error: string | null;
  self: boolean;
  liveAds: number;
  /** Days the longest-running live ad has run. */
  longest: number;
}

export interface PreviewBody {
  brand: { name: string; url: string; summary: string; category: string };
  companies: PreviewCompany[];
  report: { headline: string; summary: string; opportunities: Opportunity[]; landscape: Landscape };
  /** The ads the report cites, for the evidence thumbnails. */
  ads: Ad[];
}

export interface Preview {
  id: string;
  url: string;
  domain: string;
  status: "running" | "done" | "error";
  stage: string | null;
  error: string | null;
  body: PreviewBody | null;
  created_at: string;
}

export type PreviewError = "invalid" | "unconfigured" | "visitor_limit" | "daily_limit";
/** `start`: a new row; run the pipeline for this URL. */
export type StartResult = { id: string; start?: string } | { error: PreviewError };

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
export const hashIp = (ip: string) => createHash("sha256").update(`trnd-preview:${ip}`).digest("hex");

/** Reuse this site's report from the last week (or one still running), else start a new one within the limits. */
export async function createPreview(raw: string, ipHash: string): Promise<StartResult> {
  const url = normalizeUrl(raw);
  if (!url) return { error: "invalid" };
  if (!isModelConfigured) return { error: "unconfigured" };
  const domain = hostOf(url);
  const sb = adminSupabase();
  const now = Date.now();

  const { data: recent } = await sb
    .from("previews")
    .select("id, status, created_at")
    .eq("domain", domain)
    .gte("created_at", new Date(now - REUSE_DONE_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(5);
  const reuse = (recent ?? []).find((p) => p.status === "done" || (p.status === "running" && now - Date.parse(p.created_at) < STALE_MS));
  if (reuse) return { id: reuse.id };

  const dayAgo = new Date(now - 86_400_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    sb.from("previews").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", dayAgo),
    sb.from("previews").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
  ]);
  if ((mine ?? 0) >= PER_VISITOR_PER_DAY) return { error: "visitor_limit" };
  if ((all ?? 0) >= env.previewDailyLimit) return { error: "daily_limit" };

  const { data, error } = await sb.from("previews").insert({ url, domain, ip_hash: ipHash, stage: "Starting" }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "could not save the report");
  return { id: data.id, start: url };
}

/** Run the pipeline for a preview row and store what it found. Never throws. */
export async function runPreview(id: string, url: string): Promise<void> {
  const sb = adminSupabase();
  try {
    const { found, companies, report } = await runPipeline(url, {
      rivals: PREVIEW_RIVALS,
      tagPerCompany: TAG_PER_COMPANY,
      onStage: async (stage) => {
        await sb.from("previews").update({ stage }).eq("id", id);
      },
    });
    const today = new Date().toISOString().slice(0, 10);
    const cited = new Set(report.opportunities.flatMap((o) => o.evidence));
    const body: PreviewBody = {
      brand: { name: found.name, url, summary: found.summary, category: found.category },
      companies: companies.map((c) => ({
        name: c.name,
        website: c.website,
        pageName: c.pageName,
        error: c.error,
        self: Boolean(c.self),
        liveAds: c.ads.length,
        longest: Math.max(0, ...c.ads.map((a) => daysRunning(a, today) ?? 0)),
      })),
      report: { headline: report.headline, summary: report.summary, opportunities: report.opportunities, landscape: report.landscape },
      ads: companies.flatMap((c) => c.ads).filter((a) => cited.has(a.archive_id)),
    };
    await sb.from("previews").update({ status: "done", stage: null, body, finished_at: new Date().toISOString() }).eq("id", id);
  } catch (err) {
    console.warn("[preview] failed:", (err as Error).message);
    await sb
      .from("previews")
      .update({ status: "error", stage: null, error: (err as Error).message.slice(0, 300), finished_at: new Date().toISOString() })
      .eq("id", id);
  }
}

export async function getPreview(id: string): Promise<Preview | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await adminSupabase().from("previews").select("id, url, domain, status, stage, error, body, created_at").eq("id", id).maybeSingle<Preview>();
  if (data?.status === "running" && Date.now() - Date.parse(data.created_at) > STALE_MS) {
    return { ...data, status: "error", error: "The read took too long and stopped." };
  }
  return data;
}
