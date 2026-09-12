import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright backs the website-import render fallback (lib/import/render.ts).
  // Keep it out of the server bundle: it resolves at runtime where installed
  // and the import fails gracefully where it isn't (e.g. serverless).
  serverExternalPackages: ["playwright"],
  experimental: {
    serverActions: {
      // Ad exports from Meta Ads Manager and Google Ads upload through a
      // server action (lib/ads/actions.ts), which caps them at 5 MB. The
      // framework's default 1 MB would reject a large export before that
      // check ever runs.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
