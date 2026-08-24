import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 150_000,
  expect: { timeout: 20_000 },
  retries: 0,
  use: {
    baseURL: "http://localhost:3117",
    screenshot: "only-on-failure",
    // Pre-installed Chromium (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD env); the
    // pinned @playwright/test version must not try to download its own.
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: "pnpm seed && pnpm start -p 3117",
    url: "http://localhost:3117",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
