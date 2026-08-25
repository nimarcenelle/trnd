import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

// The cloud sandbox pre-installs Chromium at a fixed path; on a normal
// machine Playwright manages its own browsers (`npx playwright install chromium`).
const sandboxChromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 150_000,
  expect: { timeout: 20_000 },
  retries: 0,
  use: {
    baseURL: "http://localhost:3117",
    screenshot: "only-on-failure",
    launchOptions: existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  },
  webServer: {
    // Isolated demo store: E2E runs never write into the dev .demo-data —
    // recorded "results" from tests must not pollute real demo learnings.
    // GEMINI_API_KEY is blanked so E2E exercises the deterministic path:
    // no live LLM calls, no per-run cost, no 45s+ generation stalls.
    command: "rm -rf .demo-data-e2e && pnpm seed && pnpm start -p 3117",
    url: "http://localhost:3117",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { TRND_DEMO_DIR: ".demo-data-e2e", GEMINI_API_KEY: "" },
  },
});
