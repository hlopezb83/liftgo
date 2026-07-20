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

// v7.72.1: la suite visual se ejecuta solo bajo demanda (`E2E_VISUAL=1`)
// porque los baselines dependen del runner (fuentes, GPU headless) y del
// dataset semilla del día. Sin ese gate cada corrida de CI fallaba con
// "A snapshot doesn't exist". Para regenerar baselines localmente:
//   E2E_VISUAL=1 bun run test:e2e:update-snapshots -- --grep visual
test.beforeEach(() => {
  // eslint-disable-next-line playwright/no-skipped-test -- Gate por E2E_VISUAL=1 (baselines dependen del runner).
  test.skip(!process.env.E2E_VISUAL, "Auditoría visual desactivada (activa con E2E_VISUAL=1)");
});

test.use({ viewport: { width: 1600, height: 900 } });

for (const route of ROUTES) {
  test(`visual desktop ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // Espera a que el contenido principal se pinte y las animaciones acaben.
    await expect(page.locator("main, [role='main']").first()).toBeVisible({ timeout: 15_000 });
    // Fonts listas antes de screenshot para evitar diffs por FOUT.
    await page.evaluate(() => document.fonts?.ready);

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
