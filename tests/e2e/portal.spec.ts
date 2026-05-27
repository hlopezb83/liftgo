import { test, expect } from "@playwright/test";

/**
 * Customer portal — runs WITHOUT the admin storageState (own project in
 * playwright.config.ts). Asserts the public login page loads.
 *
 * Full login + invoice view requires a seeded portal customer; skipped for now.
 */
test.describe("Customer portal", () => {
  test("portal login page loads", async ({ page }) => {
    await page.goto("/portal/login");
    await expect(page.getByRole("button", { name: /entrar|iniciar|acceder|sign in/i }).first())
      .toBeVisible({ timeout: 10_000 });
  });

  test.skip("portal customer sees assigned invoice", async () => {
    // TODO: needs seeded portal customer credentials.
  });
});
