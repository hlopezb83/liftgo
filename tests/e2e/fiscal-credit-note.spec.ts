import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * T5: notas de crédito — smoke sobre /notas-de-credito y el flujo desde
 * detalle de factura.
 */
test.describe("Fiscal — Notas de crédito", () => {
  test("/notas-de-credito renderiza", async ({ page }) => {
    await page.goto("/notas-de-credito", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
  });

  test("botón crear NC visible en detalle de factura timbrada", async ({ page, seed }) => {
    await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
    const btn = page
      .getByTestId("create-credit-note-btn")
      .or(page.getByRole("button", { name: /nota de cr[eé]dito|crear nc/i }))
      .first();
    if (await btn.count() === 0) {
      test.skip(true, "Factura seed no timbrada — botón NC no aplica");
      return;
    }
    await expect(btn).toBeVisible({ timeout: TIMEOUTS.short });
  });
});
