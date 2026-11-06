import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/admin", "/start/", "/join/"] }],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://usetrnd.com"}/sitemap.xml`,
  };
}
