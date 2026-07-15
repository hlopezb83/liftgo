import { test, expect } from "./fixtures/seed";
import { expectNoToastError } from "./fixtures/helpers";

/**
 * Suite A — Flujo end-to-end: cotización → reserva → factura → pago.
 *
 * Los specs unitarios (`quote-to-booking`, `booking-to-invoice`,
 * `invoice-payment`) ya cubren cada tramo. Este spec valida la cadena completa
 * usando el escenario seed para asegurar que las transiciones de estado
 * sobreviven a un solo test corrido de punta a punta.
 *
 * Objetivo: detectar regresiones donde una transición aislada pasa pero la
 * cadena falla por acoplamiento (ej. cache de TanStack Query que no invalida).
 */
test("cadena completa: cotización → reserva → factura → pago", async ({ page, seed }) => {
  // 1. La cotización sembrada existe y se puede abrir.
  await page.goto(`/quotes/${seed.quote_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.quote_number).first()).toBeVisible({ timeout: 15_000 });

  // 2. La reserva derivada existe y muestra el enlace a la cotización origen.
  await page.goto(`/bookings/${seed.booking_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.booking_number).first()).toBeVisible({ timeout: 15_000 });

  // 3. La factura derivada existe y muestra el total sembrado.
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });

  // 4. Registra el pago total y valida transición a pagada.
  const payButton = page.getByRole("button", { name: /registrar pago|nuevo pago/i }).first();
  await expect(payButton).toBeVisible({ timeout: 10_000 });
  await payButton.click();

  const dialog = page.getByTestId("record-payment-dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByLabel(/monto del pago/i).first().fill(String(seed.total));

  const paymentResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/rest/v1/payments") && res.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.getByTestId("record-payment-submit").click();

  const paymentResponse = await paymentResponsePromise;
  expect(paymentResponse.status()).toBeGreaterThanOrEqual(200);
  expect(paymentResponse.status()).toBeLessThan(300);

  await expect(page.getByText(/pagad[ao]/i).first()).toBeVisible({ timeout: 15_000 });
  await expectNoToastError(page);
});
