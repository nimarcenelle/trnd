import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://usetrnd.com";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
