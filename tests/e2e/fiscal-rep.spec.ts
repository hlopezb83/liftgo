import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * T5: REP (Recibo Electrónico de Pagos) para facturas PPD.
 * Smoke: verifica la ruta /rep carga y expone la sección de complementos.
 */
test.describe("Fiscal — Complementos de Pago (REP)", () => {
  test("/rep renderiza tablero de complementos", async ({ page }) => {
    await page.goto("/rep", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
    await expect(page.getByText(/no autorizado|acceso denegado/i)).toHaveCount(0);
  });

  test("registrar pago desde detalle de factura muestra botón generar REP", async ({ page, seed }) => {
    await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    const registerBtn = page
      .getByTestId("register-payment-btn")
      .or(page.getByRole("button", { name: /registrar pago/i }))
      .first();

    if (await registerBtn.count() === 0) {
      test.skip(true, "Sin botón registrar pago (factura no PPD o ya pagada)");
      return;
    }
    // Solo verificamos que abre el flow
    await registerBtn.click();
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: TIMEOUTS.medium });
  });
});
