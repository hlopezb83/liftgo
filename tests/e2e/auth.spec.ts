import { test, expect } from "@playwright/test";

test.describe("Auth", () => {
  test("authenticated user reaches the dashboard", async ({ page }) => {
    await page.goto("/");
    // AuthGuard renders the dashboard layout when storageState is valid.
    // We assert the sidebar is present and the auth screen is not shown.
    await expect(page.getByText("Iniciar Sesión")).toHaveCount(0);
    // Sidebar / main nav landmark
    await expect(page.locator("nav, [role='navigation']").first()).toBeVisible({ timeout: 10_000 });
  });
});
