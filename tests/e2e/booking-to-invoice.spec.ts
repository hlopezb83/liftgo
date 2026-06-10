import { test, expect } from "./fixtures/seed";

/**
 * Booking → Invoice happy path.
 *
 * Las listas (`/invoices`) filtran filas con `is_e2e=true` por diseño para no
 * contaminar la UI real. Verificamos por detalle directo (que no aplica ese
 * filtro) que la factura sembrada exista y enlace a la reserva origen.
 */
test("seeded invoice is accessible by id", async ({ page, seed }) => {
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });
});

test("invoice detail shows source booking link", async ({ page, seed }) => {
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/generada desde reserva/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href="/bookings"]').first()).toBeVisible({ timeout: 15_000 });
});
