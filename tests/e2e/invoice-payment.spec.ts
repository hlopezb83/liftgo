import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Invoice → Payment happy path.
 *
 * Abre la factura sembrada, hace click en "Registrar pago", llena el monto
 * total y verifica que el badge de estado transiciona a "pagad{a|o}".
 *
 * Aserciones de red: validamos que el POST a `payments` retorne 2xx, evitando
 * el falso positivo de un toast de éxito que solo refleja optimistic UI.
 *
 * Sin `test.skip` condicionales: si el botón no aparece o el flujo se rompe,
 * el test DEBE fallar — esa es la única forma de detectar regresiones reales.
 */
test("can register a full payment on a seeded invoice", async ({ page, seed }) => {
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: TIMEOUTS.long });

  // v7.223.0: usar data-testid en lugar de regex de copy.
  const payButton = page.getByTestId("invoice-register-payment").first();
  await expect(payButton).toBeVisible({ timeout: TIMEOUTS.medium });
  await payButton.click();

  const dialog = page.getByTestId("record-payment-dialog");
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.short });

  const amountInput = dialog.getByLabel(/monto del pago/i).first();
  await expect(amountInput).toBeVisible({ timeout: TIMEOUTS.short });
  await amountInput.fill(String(seed.total));

  // Capturamos la respuesta de Supabase REST al insertar el pago en paralelo
  // al click. Si el insert falla (RLS, validación, etc.) el test falla aquí
  // con un mensaje claro en vez de quedarse esperando un badge que nunca llega.
  const paymentResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/rest/v1/payments") && res.request().method() === "POST",
    { timeout: TIMEOUTS.long },
  );

  await page.getByTestId("record-payment-submit").click();

  const paymentResponse = await paymentResponsePromise;
  expect(
    paymentResponse.status(),
    `POST /payments respondió ${paymentResponse.status()}: ${await paymentResponse.text()}`,
  ).toBeGreaterThanOrEqual(200);
  expect(paymentResponse.status()).toBeLessThan(300);

  await expect(page.getByText(/pagad[ao]/i).first()).toBeVisible({ timeout: TIMEOUTS.long });
});
