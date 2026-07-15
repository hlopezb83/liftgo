import { test, expect } from "@playwright/test";

/**
 * Regresión Sprint J — Filtros de Facturas.
 *
 * Bug histórico (v7.62.2): al alternar entre StatusTabs, la tabla se congelaba
 * después del primer cambio porque el hook `useLiftgoTable` reutilizaba la
 * identidad del objeto. El fix con `Proxy` + deps primitivas debe permitir
 * alternar entre pestañas N veces sin regresiones.
 *
 * v7.72.1: los estados de factura vigentes son
 * `all | draft | sent | partial | paid | overdue` con labels
 * `Todos | Borrador | Sin Pagar | Parcial | Pagado | Vencido`. El test previo
 * buscaba "pendiente" (que ya no existe) y fallaba con timeout.
 */
const STATUS_TABS = [
  { value: "sent", label: /sin pagar/i },
  { value: "paid", label: /pagado/i },
  { value: "overdue", label: /vencido/i },
  { value: "all", label: /todos/i },
] as const;

test.describe("Facturas — filtros StatusTabs", () => {
  test("alterna entre estados sin congelarse (regresión v7.62.2)", async ({ page }) => {
    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /facturas/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Esperar a que el StatusTabs esté montado (fetch inicial resuelto).
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Alternar 5 vueltas — cualquier hit al bug del Proxy congela la tabla
    // y estos asserts fallan porque el tab activo no avanza.
    for (let i = 0; i < 5; i++) {
      for (const { label } of STATUS_TABS) {
        const target = page.getByRole("tab", { name: label }).first();
        await target.click();
        await expect(target).toHaveAttribute("data-state", "active", { timeout: 5_000 });

        // Esperar a que la tabla termine de re-render.
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      }
    }
  });
});
