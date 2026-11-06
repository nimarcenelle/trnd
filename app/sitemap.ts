import type { MetadataRoute } from "next";

import { publicHandles } from "@/lib/preview/run";

/** The marketing pages, and every public creator read from the last 30 days. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://creators.usetrnd.com";
  const reads = process.env.SUPABASE_SERVICE_ROLE_KEY ? await publicHandles().catch(() => []) : [];
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...reads.map((r) => ({ url: `${base}/creators/@${r.handle}`, lastModified: r.created_at, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
