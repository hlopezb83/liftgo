import { test, expect } from "./fixtures/seed";
import { expectNoToastError, TIMEOUTS } from "./fixtures/helpers";

/**
 * Suite A — Flujo end-to-end: cotización → reserva → factura → pago.
 *
 * Fase 4: absorbe los asserts de `quote-to-booking.spec.ts`,
 * `booking-to-invoice.spec.ts` y `auth.spec.ts` (eliminados por redundantes).
 * Las listas filtran filas con `is_e2e=true`, por eso navegamos por detalle
 * directo con los IDs del seed.
 */
test("cadena completa: cotización → reserva → factura → pago", async ({ page, seed }) => {
  // 0. Sesión válida: el shell autenticado renderiza (ex auth.spec.ts).
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Iniciar Sesión" })).toHaveCount(0);
  await expect(page.locator("nav, [role='navigation']").first()).toBeVisible({
    timeout: TIMEOUTS.medium,
  });

  // 1. La cotización sembrada existe y se puede abrir.
  await page.goto(`/quotes/${seed.quote_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.quote_number).first()).toBeVisible({
    timeout: TIMEOUTS.long,
  });

  // 2. La reserva derivada existe y es accesible por id.
  await page.goto(`/bookings/${seed.booking_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.booking_number).first()).toBeVisible({
    timeout: TIMEOUTS.long,
  });

  // 3. La factura derivada existe, muestra el total y enlaza a la reserva
  //    origen (ex booking-to-invoice.spec.ts).
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({
    timeout: TIMEOUTS.long,
  });
  await expect(page.getByText(/generada desde reserva/i).first()).toBeVisible({
    timeout: TIMEOUTS.long,
  });
  await expect(page.locator('a[href="/bookings"]').first()).toBeVisible({
    timeout: TIMEOUTS.long,
  });

  // 4. Registra el pago total y valida transición a pagada.
  // v7.223.0: usar data-testid en lugar de regex de copy para evitar
  // fragilidad ante cambios de i18n.
  const payButton = page.getByTestId("invoice-register-payment").first();
  await expect(payButton).toBeVisible({ timeout: TIMEOUTS.medium });
  await payButton.click();

  const dialog = page.getByTestId("record-payment-dialog");
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.short });
  await dialog.getByLabel(/monto del pago/i).first().fill(String(seed.total));

  const paymentResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/rest/v1/payments") && res.request().method() === "POST",
    { timeout: TIMEOUTS.long },
  );
  await page.getByTestId("record-payment-submit").click();

  const paymentResponse = await paymentResponsePromise;
  expect(paymentResponse.status()).toBeGreaterThanOrEqual(200);
  expect(paymentResponse.status()).toBeLessThan(300);

  // v7.226.3: esperar cierre del diálogo antes de verificar el badge de pagada
  // — evitaba flakiness cuando la invalidación de cache llegaba antes del
  // re-render del status en el header.
  await expect(dialog).toBeHidden({ timeout: TIMEOUTS.long });
  await expect(page.getByText(/pagad[ao]/i).first()).toBeVisible({ timeout: TIMEOUTS.long });
  await expectNoToastError(page);
});
