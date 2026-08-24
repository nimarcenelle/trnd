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
    // Isolated demo store: E2E runs never write into the dev .demo-data —
    // recorded "results" from tests must not pollute real demo learnings.
    command: "rm -rf .demo-data-e2e && pnpm seed && pnpm start -p 3117",
    url: "http://localhost:3117",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { TRND_DEMO_DIR: ".demo-data-e2e" },
  },
});
