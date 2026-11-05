import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/essay/access"] }],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://admitted.usetrnd.com"}/sitemap.xml`,
  };
}
