import { test, expect } from "./fixtures/seed";

/**
 * Invoice → Payment happy path.
 *
 * Abre la factura sembrada, hace click en "Registrar pago", llena el monto
 * total y verifica que el badge de estado transiciona a "pagad{a|o}".
 *
 * Sin `test.skip` condicionales: si el botón no aparece o el flujo se rompe,
 * el test DEBE fallar — esa es la única forma de detectar regresiones reales.
 */
test("can register a full payment on a seeded invoice", async ({ page, seed }) => {
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });

  const payButton = page.getByRole("button", { name: /registrar pago|nuevo pago/i }).first();
  await expect(payButton).toBeVisible({ timeout: 10_000 });
  await payButton.click();

  const amountInput = page.getByLabel(/monto|importe/i).first();
  await expect(amountInput).toBeVisible({ timeout: 5_000 });
  await amountInput.fill(String(seed.total));

  await page.getByRole("button", { name: /guardar|registrar|confirmar/i }).first().click();

  await expect(page.getByText(/pagad[ao]/i).first()).toBeVisible({ timeout: 15_000 });
});
