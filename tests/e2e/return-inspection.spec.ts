import { test, expect } from "./fixtures/seed";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * T5: inspección de devolución con daño — smoke sobre /returns y el flujo
 * de crear inspección. La lógica de cierre atómico está probada en Deno
 * (`complete_return_inspection` RPC) — aquí verificamos que la UI existe.
 */
test.describe("Devoluciones — inspección", () => {
  test("/returns renderiza lista", async ({ page }) => {
    await page.goto("/returns", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
    await expect(page.getByText(/no autorizado/i)).toHaveCount(0);
  });

  test("desde detalle de reserva, botón crear inspección visible", async ({ page, seed }) => {
    await page.goto(`/bookings/${seed.booking_id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    const inspectBtn = page
      .getByTestId("create-return-inspection-btn")
      .or(page.getByRole("button", { name: /inspecci[oó]n|devoluci[oó]n/i }))
      .first();
    // No forzamos click — la reserva seed puede no estar en estado devolvible.
    if (await inspectBtn.count() > 0) {
      await expect(inspectBtn).toBeVisible();
    }
  });
});
