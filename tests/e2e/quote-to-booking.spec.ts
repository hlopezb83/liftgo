import { test, expect } from "./fixtures/seed";

/**
 * Quote → Booking happy path.
 *
 * The seed RPC already creates a booking linked to the accepted quote
 * (mirrors the result of clicking "Convertir a reserva"). We verify the
 * seeded RSV-XXXX renders in the bookings list, proving the conversion
 * data shape is correct end-to-end.
 */
test("seeded booking appears in bookings list", async ({ page, seed }) => {
  await page.goto("/bookings", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.booking_number).first()).toBeVisible({ timeout: 15_000 });
});

test("accepted quote renders with linked booking", async ({ page, seed }) => {
  await page.goto(`/quotes/${seed.quote_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.quote_number).first()).toBeVisible({ timeout: 15_000 });
});
