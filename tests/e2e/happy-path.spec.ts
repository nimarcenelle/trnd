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
  await expect(page.getByText("Headline 5")).toBeVisible();
  await expect(page.getByText("Primary text 3")).toBeVisible();
  await expect(page.getByText("Launch checklist")).toBeVisible();
  await expect(page.getByText("in-feed preview — variant 1")).toBeVisible();
  // long-form assets live behind disclosures — open them
  await page.getByText("Short-form video scripts").click();
  await expect(page.getByText("Script 3")).toBeVisible();
  await page.getByText("Landing copy", { exact: true }).click();
  await expect(page.getByText("Landing section")).toBeVisible();

  // --- mark launched
  await page.getByRole("button", { name: "Mark as launched" }).click();
  await expect(page.getByRole("link", { name: "Enter results →" })).toBeVisible({ timeout: 15_000 });

  // --- enter results, see history, learnings updated
  await page.getByRole("link", { name: "Enter results →" }).click();
  await expect(page).toHaveURL(/\/app\/results/);
  await page.getByPlaceholder("12,400").fill("12400");
  await page.getByPlaceholder("310").fill("310");
  await page.getByPlaceholder("180").fill("180");
  await page.getByPlaceholder("9").fill("9");
  await page.getByPlaceholder("1,240").fill("1240");
  await page.getByRole("button", { name: "Record results" }).click();
  // Revalidation flips the campaign to complete and moves it into history.
  await expect(page.getByRole("cell", { name: "2.50%" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/What TRND has learned/)).toBeVisible();
});
