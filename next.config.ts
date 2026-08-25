import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright backs the website-import render fallback (lib/import/render.ts).
  // Keep it out of the server bundle: it resolves at runtime where installed
  // and the import fails gracefully where it isn't (e.g. serverless).
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
