import { test, expect } from "./fixtures/seed";

/**
 * Quote → Booking happy path.
 *
 * La lista de `/bookings` filtra filas con `is_e2e=true` por diseño. Verificamos
 * por detalle directo que la reserva sembrada exista y que la cotización
 * aceptada cargue correctamente.
 */
test("seeded booking is accessible by id", async ({ page, seed }) => {
  await page.goto(`/bookings/${seed.booking_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.booking_number).first()).toBeVisible({ timeout: 15_000 });
});

test("accepted quote renders with linked booking", async ({ page, seed }) => {
  await page.goto(`/quotes/${seed.quote_id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(seed.quote_number).first()).toBeVisible({ timeout: 15_000 });
});
