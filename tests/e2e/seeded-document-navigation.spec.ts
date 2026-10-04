import { test, expect } from "./fixtures/seed";
import { expectNoToastError, TIMEOUTS } from "./fixtures/helpers";

/** Navegación de documentos sembrados; las conversiones se prueban en el gate local. */
test("navegación de cotización, reserva y factura sembradas", async ({ page, seed }) => {
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

  await expectNoToastError(page);
});
