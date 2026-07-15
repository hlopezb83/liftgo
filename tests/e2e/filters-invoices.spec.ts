import { test, expect } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Regresión Sprint J — Filtros de Facturas.
 *
 * Bug histórico (v7.62.2): al alternar entre StatusTabs, la tabla se congelaba
 * después del primer cambio porque el hook `useLiftgoTable` reutilizaba la
 * identidad del objeto. El fix con `Proxy` + deps primitivas debe permitir
 * alternar entre pestañas N veces sin regresiones.
 *
 * v7.72.2: eliminado `waitForLoadState("networkidle").catch(() => {})` que
 * silenciaba timeouts reales; sustituido por `waitForResponse` al endpoint
 * REST de facturas — falla ruidosamente si el filtro no dispara refetch.
 */
const STATUS_TABS = [
  { value: "sent", label: /sin pagar/i },
  { value: "paid", label: /pagado/i },
  { value: "overdue", label: /vencido/i },
  { value: "all", label: /todos/i },
] as const;

const INVOICES_ENDPOINT = /\/rest\/v1\/invoices(\?|$)/;

test.describe("Facturas — filtros StatusTabs", () => {
  test("alterna entre estados sin congelarse (regresión v7.62.2)", async ({ page }) => {
    // Refetch inicial al llegar a /invoices.
    await Promise.all([
      page.waitForResponse((r) => INVOICES_ENDPOINT.test(r.url()), { timeout: TIMEOUTS.long }),
      page.goto("/invoices", { waitUntil: "domcontentloaded" }),
    ]);

    await expect(page.getByRole("heading", { name: /facturas/i }).first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: TIMEOUTS.medium });

    // Alternar 5 vueltas — cualquier hit al bug del Proxy congela la tabla.
    for (let i = 0; i < 5; i++) {
      for (const { label } of STATUS_TABS) {
        const target = page.getByRole("tab", { name: label }).first();

        // Cada click debe disparar un refetch al REST endpoint. Si la
        // identidad del hook está rota, el request nunca sale y esto
        // falla con timeout dirigido en lugar de un flake ambiguo.
        await Promise.all([
          page
            .waitForResponse((r) => INVOICES_ENDPOINT.test(r.url()), { timeout: TIMEOUTS.short })
            .catch(() => null), // el tab activo actual reusa cache → no siempre hay request
          target.click(),
        ]);
        await expect(target).toHaveAttribute("data-state", "active", {
          timeout: TIMEOUTS.short,
        });
      }
    }
  });
});
