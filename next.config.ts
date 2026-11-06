import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/guides/anatomy-of-a-winning-essay.pdf", destination: "/guides/7-essay-mistakes.pdf", permanent: true }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Ads Manager exports upload through a server action, which checks for 4 MB itself.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
