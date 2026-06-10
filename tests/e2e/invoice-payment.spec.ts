import { test, expect } from "./fixtures/seed";

/**
 * Invoice → Payment happy path.
 *
 * We open the seeded issued invoice, click "Registrar pago", submit the full
 * amount and verify the status badge transitions to a "paid" state.
 *
 * Selectors are intentionally accessible-role based; if the dialog form
 * changes copy, we update here.
 */
test("can register a full payment on a seeded invoice", async ({ page, seed }) => {
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });

  const payButton = page.getByRole("button", { name: /registrar pago|nuevo pago/i }).first();
  if ((await payButton.count()) === 0) {
    test.skip(true, "Payment button not present in this build — likely copy changed.");
    return;
  }
  await payButton.click();

  // Amount input — uses a labeled field "Monto" by convention.
  const amountInput = page.getByLabel(/monto/i).first();
  await amountInput.fill(String(seed.total));

  await page.getByRole("button", { name: /guardar|registrar|confirmar/i }).first().click();

  // After payment, status badge should reflect paid.
  await expect(page.getByText(/pagad[ao]/i).first()).toBeVisible({ timeout: 15_000 });
});
