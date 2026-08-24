import { expect, test } from "@playwright/test";

/**
 * The happy path from the Definition of Done: signup → onboarding →
 * recommendation → campaign. Runs against the demo-mode store (seeded), so it
 * needs no external credentials.
 */
test("signup → onboarding → recommendation → campaign → launch", async ({ page }) => {
  const email = `e2e-${Date.now()}@trnd.dev`;

  // --- signup
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("trnd-e2e-password");
  await page.getByRole("button", { name: "Create account" }).click();

  // --- onboarding wizard
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Business name").fill("Glow Aesthetics Studio");
  await page.getByRole("button", { name: "Continue →" }).click();

  await page.getByRole("radio", { name: "Health & beauty" }).click();
  await page.getByRole("button", { name: "Continue →" }).click();

  await page.getByLabel("City").fill("Atlanta");
  await page.getByLabel("State / region").fill("GA");
  await page.getByRole("button", { name: "Continue →" }).click();

  await page.getByLabel("Service 1 name").fill("Facial balancing consult");
  await page.getByLabel("Service 1 price").fill("$99");
  await page.getByRole("button", { name: "Continue →" }).click();

  await page.getByLabel("Brand voice notes").fill("Warm but direct. No exclamation marks.");
  // The submit swaps its label ("Setting up…") and navigates — race-proof it.
  const toApp = page.waitForURL(/\/app$/, { timeout: 30_000 });
  await page
    .getByRole("button", { name: /Finish setup|Setting up/ })
    .click({ timeout: 10_000 })
    .catch(() => {}); // button may detach as the action navigates
  await toApp;
  await page.getByText(/This week.s recommendation/).waitFor({ state: "visible", timeout: 20_000 });
  await page.getByText("/ 10").first().waitFor({ state: "visible", timeout: 20_000 });

  // --- build the campaign
  const toCampaign = page.waitForURL(/\/app\/campaigns\//, { timeout: 45_000 });
  await page
    .getByRole("button", { name: "Build the campaign" })
    .click({ timeout: 10_000 })
    .catch(() => {});
  await toCampaign;
  await expect(page.getByText("Headlines — 5 variants")).toBeVisible();
  await expect(page.getByText("Primary texts — 3 variants")).toBeVisible();
  await expect(page.getByText("Short-form video scripts — 3")).toBeVisible();
  await expect(page.getByText("Landing copy")).toBeVisible();

  // --- mark launched
  await page.getByRole("button", { name: "Mark as launched" }).click();
  await expect(page.getByRole("link", { name: "Enter results →" })).toBeVisible({ timeout: 15_000 });
});
