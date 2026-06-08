import { test, expect } from "@playwright/test";

/**
 * Booking flow placeholder.
 *
 * The full happy-path (open /reservas/new → pick customer → forklift → dates → save → RSV-XXXX in list)
 * requires stable selectors on the booking form fields. Skipped until selectors are
 * stabilized (see docs/e2e-roadmap.md).
 *
 * For now we assert the booking list page loads and shows the header.
 */
test.describe("Bookings", () => {
  test("bookings list loads", async ({ page }) => {
    await page.goto("/bookings", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").filter({ hasText: /reservas/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test.skip("create booking RSV-XXXX appears in list", async () => {
    // TODO: implement once data-testid attributes are added to the booking form.
  });
});
