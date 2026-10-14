import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Ads Manager exports upload through a server action, which checks for 4 MB itself.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
