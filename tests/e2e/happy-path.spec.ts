import { expect, test } from "@playwright/test";

/**
 * The path a pilot brand walks: signup, onboarding, the week's creative
 * tests, one brief opened, chosen, launched, closed with numbers, and the
 * track record that results from it. Runs against the demo-mode store
 * (seeded), keyless: the template writer, no model, no external service.
 */
test("signup → onboarding → the week's tests → choose → launch → results → track record", async ({ page }) => {
  const email = `e2e-${Date.now()}@trnd.dev`;

  // --- signup
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("trnd-e2e-password");
  await page.getByRole("button", { name: "Create account" }).click();

  // --- onboarding wizard, the manual path (no website): a local business,
  // so the steps ask for a city and the seeded category has signals.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Business name").fill("Glow Aesthetics Studio");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("radio", { name: "Local business" }).click();
  await page.getByRole("button", { name: "Health & beauty" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("City").fill("Atlanta");
  await page.getByLabel("State / region").fill("GA");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Service 1 name").fill("Facial balancing consult");
  await page.getByLabel("Service 1 price").fill("$99");
  await page.getByRole("button", { name: "Continue" }).click();

  // The context a brief needs. Every field is optional, but the pilot asks
  // for the export: it is what makes the week more than research, and what
  // lets the Brand signal count so the grade has something to rest on.
  await page.locator('input[aria-label="Ads Manager export"]').setInputFiles("tests/e2e/fixtures/ads-manager-export.csv");
  await expect(page.getByText("Read. Imported as your ad history at the finish.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Brand voice notes").fill("Warm but direct. No exclamation marks.");
  const toApp = page.waitForURL(/\/app(\/picks)?$/, { timeout: 30_000 });
  await page
    .getByRole("button", { name: /Finish setup|Finishing setup/ })
    .click({ timeout: 10_000 })
    .catch(() => {}); // the button may detach as the action navigates
  await toApp;

  // --- the week is written in the background; the page waits, then lists it
  await expect(page.getByRole("heading", { name: "What to make next" })).toBeVisible({ timeout: 120_000 });
  // The export was read at the finish, so the week is not research-only; the
  // one thing still missing is the objective, and the week says so.
  await expect(page.getByText(/Your ad results are on file/)).toBeVisible();

  // --- open the first test: the brief, whole
  await page.locator("ol.cbl a.cbl__row").first().click();
  await expect(page).toHaveURL(/\/app\/picks\//);
  await expect(page.getByRole("heading", { name: "The hypothesis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What to make" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved facts" })).toBeVisible();
  await expect(page.locator("dt", { hasText: "Name it" })).toBeVisible();

  // --- choose it, then mark it launched
  await page.getByRole("button", { name: "Choose for production" }).click();
  await expect(page.getByText("In production", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Mark launched" }).click();
  await expect(page.getByText("Launched", { exact: true })).toBeVisible({ timeout: 15_000 });

  // --- close it with numbers on Campaigns
  await page.goto("/app/campaigns");
  await page.getByText("Mark completed").click();
  await page.getByLabel("Spend (USD)").fill("400");
  await page.getByLabel("Impressions").fill("9000");
  await page.getByLabel("Clicks").fill("180");
  await page.getByLabel("Purchases").fill("6");
  await page.getByLabel("Revenue (USD)").fill("960");
  await page.getByRole("button", { name: "Save and complete" }).click();
  await expect(page.getByText(/CTR 2%/)).toBeVisible({ timeout: 15_000 });

  // --- the record: one scored run, judged on its numbers
  await page.goto("/app/record");
  await expect(page.getByRole("heading", { name: "Track record" })).toBeVisible();
  await expect(page.getByText(/1 of 1 test you ran did better than its reference/)).toBeVisible();
  await expect(page.getByText("Predicted against actual")).toBeVisible();
});
