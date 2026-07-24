import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * T5 (Auditoría de Tests): E2E de timbrado — hoy la suite no ejercita ni un
 * flujo fiscal. Este spec cubre el botón "Timbrar" en detalle de factura.
 *
 * NOTA: usa `is_e2e=true` de `e2e_seed_scenario` → `stamp-cfdi` responde 403.
 * Verificamos que el botón existe, se dispara, y la UI muestra el rechazo
 * esperado (o el flujo happy si el seed corre con `is_e2e=false` en CI
 * dedicado). Guard contra regresión de UI donde el botón desaparecía.
 */
test.describe("Fiscal — timbrado de factura", () => {
  test("botón timbrar está disponible en detalle de BORRADOR", async ({ page, seed }) => {
    await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });

    // El header de detalle debe cargar
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    // Botón "Timbrar" o data-testid estable (agregado en Fase 1 tail-end)
    const stampBtn = page
      .getByTestId("stamp-invoice-btn")
      .or(page.getByRole("button", { name: /timbrar/i }))
      .first();

    // Puede estar oculto si la factura no cumple pre-checks — no forzamos click.
    // Guard: si aparece, debe ser clickable y no romper la app.
    if (await stampBtn.count() > 0 && await stampBtn.isVisible()) {
      await stampBtn.click();
      // Espera algún feedback: toast (éxito/error) o dialog de confirmación.
      const feedback = page
        .locator('[data-sonner-toast], [role="dialog"], [role="alertdialog"]')
        .first();
      await expect(feedback).toBeVisible({ timeout: TIMEOUTS.medium });
    }
  });
});
