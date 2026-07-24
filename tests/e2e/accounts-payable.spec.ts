import { test, expect } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * T5: Cuentas por Pagar — no había NI un spec para CxP. Smoke sobre la
 * ruta principal y la vista de antigüedad.
 */
test.describe("Cuentas por Pagar — smoke", () => {
  test("/cuentas-por-pagar renderiza tabla o vacío", async ({ page }) => {
    await page.goto("/cuentas-por-pagar", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
    await expect(page.getByText(/no autorizado/i)).toHaveCount(0);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("/cuentas-por-pagar/antiguedad renderiza reporte", async ({ page }) => {
    await page.goto("/cuentas-por-pagar/antiguedad", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
  });
});
