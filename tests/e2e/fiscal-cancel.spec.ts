import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * T5: cancelación de CFDI — verifica que el diálogo de cancelación aplica la
 * regla motivo 01 (requiere substitution_uuid) antes de invocar la edge.
 * Guard cliente probado en unit test `cancelCfdiSchema.test.ts`; aquí
 * validamos que la UI lo materializa.
 */
test.describe("Fiscal — cancelación CFDI", () => {
  test("motivo 01 sin UUID sustituto muestra error en cliente", async ({ page, seed }) => {
    await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    const cancelBtn = page
      .getByTestId("cancel-invoice-btn")
      .or(page.getByRole("button", { name: /cancelar cfdi/i }))
      .first();

    if (await cancelBtn.count() === 0 || !(await cancelBtn.isVisible())) {
      test.skip(true, "Factura seed no está timbrada — botón cancelar no aplica");
      return;
    }

    await cancelBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.medium });

    // Seleccionar motivo 01
    const motivo = dialog.getByRole("combobox").first();
    if (await motivo.count() > 0) {
      await motivo.click();
      await page.getByRole("option", { name: /01|errores con relaci/i }).first().click();
    }

    // Intentar submit sin UUID — Zod debe bloquear
    const submit = dialog.getByRole("button", { name: /confirmar|cancelar cfdi/i }).last();
    await submit.click();

    // Error visible en el field o mensaje
    await expect(dialog.getByText(/uuid.*inv|requerido|inválido/i).first())
      .toBeVisible({ timeout: TIMEOUTS.short });
  });
});
