import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Ads Manager exports upload through a server action, which checks for 4 MB itself.
    serverActions: { bodySizeLimit: "5mb" },
  },
  // No framing (clickjacking on the account and billing buttons), no MIME sniffing, no full URLs (preview ids) in Referer.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
