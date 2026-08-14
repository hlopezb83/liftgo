import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Fase 4 — spec ÚNICO de acciones fiscales.
 *
 * Reemplaza `fiscal-stamp`, `fiscal-cancel`, `fiscal-credit-note` y
 * `fiscal-rep`, que ejercitaban comportamiento del PAC ya cubierto por los
 * `handler_test.ts` de Deno. Aquí solo validamos VISIBILIDAD y ESTADO de los
 * botones fiscales en el detalle de factura (contrato de UI), más el smoke de
 * las rutas fiscales dedicadas.
 */
test.describe("Fiscal — estado de acciones en detalle de factura", () => {
  test("botones fiscales reflejan el estado de la factura seed (BORRADOR)", async ({
    page,
    seed,
  }) => {
    await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
    await expect(page.getByText(seed.invoice_number).first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    const stampBtn = page
      .getByTestId("stamp-invoice-btn")
      .or(page.getByRole("button", { name: /timbrar/i }))
      .first();
    const cancelBtn = page
      .getByTestId("cancel-invoice-btn")
      .or(page.getByRole("button", { name: /cancelar cfdi/i }))
      .first();
    const creditNoteBtn = page
      .getByTestId("create-credit-note-btn")
      .or(page.getByRole("button", { name: /nota de cr[eé]dito|crear nc/i }))
      .first();

    // Invariante de UI: una factura NO timbrada ofrece "Timbrar" y NO ofrece
    // acciones que exigen un CFDI vigente (cancelar / nota de crédito).
    const isStamped = (await cancelBtn.count()) > 0 && (await cancelBtn.isVisible());

    /* eslint-disable playwright/no-conditional-expect -- el estado fiscal del
       seed no es determinista: se valida la invariante que aplique. */
    if (isStamped) {
      await expect(cancelBtn).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(creditNoteBtn).toBeVisible({ timeout: TIMEOUTS.short });
    } else {
      await expect(stampBtn).toBeVisible({ timeout: TIMEOUTS.long });
      await expect(stampBtn).toBeEnabled({ timeout: TIMEOUTS.short });
      await expect(creditNoteBtn).toHaveCount(0);
    }
    /* eslint-enable playwright/no-conditional-expect */

    // El registro de pago (origen del REP) siempre está disponible mientras la
    // factura no esté saldada.
    await expect(page.getByTestId("invoice-register-payment").first()).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  });

  test("rutas fiscales dedicadas renderizan sin acceso denegado", async ({ page }) => {
    for (const path of ["/notas-de-credito", "/rep"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main, [role='main']").first()).toBeVisible({
        timeout: TIMEOUTS.long,
      });
      await expect(page.getByText(/no autorizado|acceso denegado/i)).toHaveCount(0);
    }
  });
});
