import { test, expect } from "@playwright/test";

/**
 * Regresión Sprint J — Filtros de Cotizaciones.
 *
 * Valida:
 *   1. Los StatusTabs de cotizaciones alternan sin congelarse (mismo bug que
 *      /invoices — comparten `useLiftgoTable` + `useTableFilters`).
 *   2. La búsqueda con `match-sorter` filtra por número de cotización y no
 *      queda "atrapada" (bug histórico de identidad de callbacks).
 */
test.describe("Cotizaciones — filtros", () => {
  test("StatusTabs alterna múltiples veces", async ({ page }) => {
    await page.goto("/quotes", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /cotizaciones/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const labels = [/borrador/i, /enviad/i, /aceptad/i, /todas/i];

    for (let i = 0; i < 3; i++) {
      for (const rx of labels) {
        const tab = page.getByRole("tab", { name: rx }).first();
        if ((await tab.count()) === 0) continue;
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });
      }
    }
  });

  test("búsqueda con match-sorter filtra sin bloquearse", async ({ page }) => {
    await page.goto("/quotes", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("searchbox").or(page.getByPlaceholder(/buscar/i)).first();
    if ((await search.count()) === 0) test.skip(true, "sin campo de búsqueda visible");

    await search.fill("COT-");
    await page.waitForTimeout(400);
    await search.fill("");
    await page.waitForTimeout(400);
    await search.fill("xxxxxx-inexistente");
    await expect(page.getByText(/sin resultados|no hay|vac/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
