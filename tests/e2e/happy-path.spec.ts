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
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Health & beauty" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("City").fill("Atlanta");
  await page.getByLabel("State / region").fill("GA");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Service 1 name").fill("Facial balancing consult");
  await page.getByLabel("Service 1 price").fill("$99");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Brand voice notes").fill("Warm but direct. No exclamation marks.");
  // The submit swaps its label ("Finishing setup…") and navigates — race-proof it.
  const toApp = page.waitForURL(/\/app(\/picks)?$/, { timeout: 30_000 });
  await page
    .getByRole("button", { name: /Finish setup|Finishing setup/ })
    .click({ timeout: 10_000 })
    .catch(() => {}); // button may detach as the action navigates
  await toApp;
  await page.getByText(/This week.s recommendation/).waitFor({ state: "visible", timeout: 20_000 });

  // --- the week's ad is written without being asked; the hero refreshes
  // into it and the owner opens it
  await page.getByRole("link", { name: "Open the campaign" }).click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/app\/campaigns\//);
  await expect(page.getByText("Headline 5")).toBeVisible();
  await expect(page.getByText("Primary text 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch" })).toBeVisible();
  await expect(page.getByText("in-feed preview — variant 1")).toBeVisible();
  // long-form assets live behind disclosures — open them
  await page.getByText("Video scripts").click();
  await expect(page.getByText("Script 3")).toBeVisible();
  await page.getByText("Landing copy", { exact: true }).click();
  await expect(page.getByText("Landing section")).toBeVisible();

  // --- mark launched: results now live on the campaign itself
  await page.getByRole("button", { name: "Mark as launched" }).click();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({ timeout: 15_000 });

  // --- campaigns index shows the live campaign, then back to the detail page
  await page.goto("/app/campaigns");
  await expect(page.getByText("Live — waiting on results")).toBeVisible();
  await page.goBack();
  await page.getByRole("heading", { name: "Results" }).waitFor({ timeout: 15_000 });

  // --- enter results on the campaign, see them in its history, learnings updated
  await page.getByPlaceholder("12,400").fill("12400");
  await page.getByPlaceholder("310").fill("310");
  await page.getByPlaceholder("180").fill("180");
  await page.getByPlaceholder("9").fill("9");
  await page.getByPlaceholder("1,240").fill("1240");
  await page.getByRole("button", { name: "Record results" }).click();
  await expect(page.getByRole("cell", { name: "2.50%" })).toBeVisible({ timeout: 20_000 });
  await page.goto("/app/results");
  await expect(page.getByText(/What converts in/)).toBeVisible();
});
