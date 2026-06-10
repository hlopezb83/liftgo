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

test("invoice detail renders booking number link", async ({ page, seed }) => {
  await page.goto(`/invoices/${seed.invoice_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.invoice_number).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(seed.booking_number).first()).toBeVisible({ timeout: 15_000 });
});
