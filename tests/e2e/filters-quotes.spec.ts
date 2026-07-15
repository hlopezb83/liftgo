import { test, expect } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Regresión Sprint J — Filtros de Cotizaciones.
 *
 * v7.72.2: eliminados `waitForTimeout(400)` como "debounce" y
 * `test.skip(true, "sin campo de búsqueda")`. Si el searchbox desaparece
 * es una regresión real y este test debe fallar, no saltarse.
 */
test.describe("Cotizaciones — filtros", () => {
  test("StatusTabs alterna múltiples veces", async ({ page }) => {
    await page.goto("/quotes", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /cotizaciones/i }).first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    const labels = [/borrador/i, /enviad/i, /aceptad/i, /todas/i];

    for (let i = 0; i < 3; i++) {
      for (const rx of labels) {
        const tab = page.getByRole("tab", { name: rx }).first();
        if ((await tab.count()) === 0) continue;
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true", {
          timeout: TIMEOUTS.short,
        });
      }
    }
  });

  test("búsqueda con match-sorter filtra sin bloquearse", async ({ page }) => {
    await page.goto("/quotes", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("searchbox").or(page.getByPlaceholder(/buscar/i)).first();
    // El searchbox es contrato — si desaparece, es regresión, no skip.
    await expect(search, "buscador de cotizaciones ausente").toBeVisible({
      timeout: TIMEOUTS.medium,
    });

    // match-sorter filtra en cliente: no hay refetch al backend, así que
    // esperamos al efecto observable (fila destino visible / vacío rendered)
    // en lugar de un `waitForTimeout` arbitrario.
    await search.fill("COT-");
    await search.fill("");
    await search.fill("xxxxxx-inexistente");
    await expect(page.getByText(/sin resultados|no hay|vac/i).first()).toBeVisible({
      timeout: TIMEOUTS.short,
    });
  });
});
