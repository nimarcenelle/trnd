import { expect, test } from "@playwright/test";

test("the homepage renders with its headline and sign-up box, without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what your competitors are doing");
  await expect(page.getByPlaceholder("yourbrand.com").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("sign in and sign up pages render", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator("input[type=email]").first()).toBeVisible();
  }
});

test("legal pages render", async ({ page }) => {
  for (const path of ["/terms", "/privacy"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test("the app sends signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});

test("API routes answer", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).ok).toBe(true);
  expect((await request.get("/api/unsubscribe?b=x&t=y")).status()).toBe(400);
  expect((await request.get("/api/logo?d=not a domain")).status()).toBe(400);
  expect((await request.get("/api/cron/scan")).status()).toBe(401);
  expect((await request.post("/api/inbound", { data: {} })).status()).toBe(404);
});
