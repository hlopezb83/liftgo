import { test, expect } from "./fixtures/seed";

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
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });

  const payButton = page.getByRole("button", { name: /registrar pago|nuevo pago/i }).first();
  await expect(payButton).toBeVisible({ timeout: 10_000 });
  await payButton.click();

  const dialog = page.getByTestId("record-payment-dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const amountInput = dialog.getByLabel(/monto del pago/i).first();
  await expect(amountInput).toBeVisible({ timeout: 5_000 });
  await amountInput.fill(String(seed.total));

  // Capturamos la respuesta de Supabase REST al insertar el pago en paralelo
  // al click. Si el insert falla (RLS, validación, etc.) el test falla aquí
  // con un mensaje claro en vez de quedarse esperando un badge que nunca llega.
  const paymentResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/rest/v1/payments") && res.request().method() === "POST",
    { timeout: 15_000 },
  );

  await page.getByTestId("record-payment-submit").click();

  const paymentResponse = await paymentResponsePromise;
  expect(
    paymentResponse.status(),
    `POST /payments respondió ${paymentResponse.status()}: ${await paymentResponse.text()}`,
  ).toBeGreaterThanOrEqual(200);
  expect(paymentResponse.status()).toBeLessThan(300);

  await expect(page.getByText(/pagad[ao]/i).first()).toBeVisible({ timeout: 15_000 });
});
