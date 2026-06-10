import { test, expect } from "./fixtures/seed";

/**
 * Booking → Invoice happy path.
 *
 * The seed RPC creates an invoice linked to the booking. We verify both
 * the invoice number lands on the invoices list and that opening the
 * detail page shows the booking link.
 */
test("seeded invoice appears in invoices list", async ({ page, seed }) => {
  await page.goto("/invoices", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });
});

test("invoice detail shows source booking link", async ({ page, seed }) => {
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });
  // InvoiceSourceLinks renderiza "Generada desde reserva:" + un link a /bookings
  // con el nombre del montacargas como label (no el booking_number).
  await expect(page.getByText(/generada desde reserva/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href="/bookings"]').first()).toBeVisible({ timeout: 15_000 });
});
