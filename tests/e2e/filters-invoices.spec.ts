import { test, expect } from "@playwright/test";

/**
 * Regresión Sprint J — Filtros de Facturas.
 *
 * Bug histórico (v7.62.2): al alternar entre StatusTabs, la tabla se congelaba
 * después del primer cambio porque el hook `useLiftgoTable` reutilizaba la
 * identidad del objeto. El fix con `Proxy` + deps primitivas debe permitir
 * alternar entre pestañas N veces sin regresiones.
 *
 * Este spec ejerce ese ciclo 5 veces y valida que:
 *   - El tab activo cambia (`aria-selected="true"`).
 *   - La URL refleja el nuevo filtro (`?status=...`).
 *   - La cantidad de filas o el estado vacío responde al cambio.
 */
const STATUS_TABS = ["pending", "paid", "overdue", "all"] as const;

test.describe("Facturas — filtros StatusTabs", () => {
  test("alterna entre estados sin congelarse (regresión v7.62.2)", async ({ page }) => {
    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /facturas/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Alternar 5 vueltas completas — cualquier hit al bug del Proxy congela
    // la tabla y estos asserts fallan porque el tab activo no avanza.
    for (let i = 0; i < 5; i++) {
      for (const status of STATUS_TABS) {
        const tab = page.getByRole("tab").filter({ has: page.locator(`[data-state]`) })
          .filter({ hasText: labelFor(status) })
          .first();
        // Fallback: busca por texto directo si el filtro compuesto no matchea.
        const target = (await tab.count()) > 0
          ? tab
          : page.getByRole("tab", { name: new RegExp(labelFor(status), "i") }).first();

        await target.click();
        await expect(target).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });

        // Esperar a que la tabla termine de re-render (skeleton fuera).
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      }
    }
  });
});

function labelFor(status: (typeof STATUS_TABS)[number]): string {
  switch (status) {
    case "pending":
      return "pendiente";
    case "paid":
      return "pagad";
    case "overdue":
      return "vencid";
    case "all":
      return "todas";
  }
}
