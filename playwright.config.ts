import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke test: the production build, started as it runs on Vercel,
 * with no database or keys, so it checks what must never break: public pages
 * render, the app sends signed-out visitors to sign in, and the API routes
 * answer. `pnpm build` first, then `pnpm e2e`. Build with placeholder
 * Supabase settings (as CI does, .github/workflows/ci.yml) so the auth client
 * can be created; it answers "signed out" without reaching anything.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "pnpm start -p 3100", url: "http://localhost:3100", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
