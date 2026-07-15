import { test, expect } from "@playwright/test";

/**
 * Auditoría visual — desktop 1600x900.
 *
 * Genera snapshots por ruta autenticada. La primera corrida crea los
 * baselines; en CI cualquier diff mayor a `maxDiffPixelRatio` falla.
 *
 * Para actualizar intencionalmente tras un cambio de diseño:
 *   bun run test:e2e:update-snapshots
 */
const ROUTES = [
  "/",
  "/fleet",
  "/customers",
  "/quotes",
  "/bookings",
  "/invoices",
  "/maintenance",
  "/mrr",
  "/income-statement",
  "/expenses",
] as const;

test.use({ viewport: { width: 1600, height: 900 } });

for (const route of ROUTES) {
  test(`visual desktop ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // Espera a que el contenido principal se pinte y las animaciones acaben.
    await expect(page.locator("main, [role='main']").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);

    // Máscaras para elementos dinámicos que rompen snapshots deterministas.
    const masks = [
      page.locator("time, [data-dynamic='date'], [data-testid='live-timestamp']"),
      page.locator("[data-nowrap-currency='live']"),
    ];

    await expect(page).toHaveScreenshot(`desktop${route.replace(/\//g, "-") || "-home"}.png`, {
      fullPage: false,
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      mask: masks,
    });
  });
}
