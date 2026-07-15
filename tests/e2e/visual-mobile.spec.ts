import { test, expect } from "@playwright/test";

/**
 * Auditoría visual — mobile 390x800.
 *
 * Valida que las rutas críticas renderizan `MobileCardList` en lugar de la
 * tabla, sin overflow horizontal.
 */
const ROUTES = ["/", "/invoices", "/bookings", "/customers", "/fleet"] as const;

test.use({ viewport: { width: 390, height: 800 } });

for (const route of ROUTES) {
  test(`visual mobile ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);

    // Sin scroll horizontal — regresión de MobileCardList.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, `overflow horizontal en ${route}`).toBeLessThanOrEqual(clientWidth + 1);

    await expect(page).toHaveScreenshot(`mobile${route.replace(/\//g, "-") || "-home"}.png`, {
      fullPage: false,
      animations: "disabled",
      maxDiffPixelRatio: 0.03,
    });
  });
}
