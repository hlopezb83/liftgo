import { test, expect } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Ronda 9 — P0: precarga de cotización al editar (lista → detalle → editar).
 *
 * Bug: `useQuoteForm` aplicaba los valores con un `form.reset()` de una sola
 * pasada. Cuando la consulta de detalle resolvía después del primer render
 * (o refetch de foco), el formulario se re-inicializaba con los valores por
 * defecto y borraba lo cargado ~500 ms después de abrirse.
 * Fix: opción reactiva `values` de RHF + fallback para cotizaciones legacy.
 *
 * Sólo un E2E captura la corrupción: en unitarios el reset no compite con el
 * ciclo real de la query. Por eso el spec espera explícitamente ese margen.
 */
test.describe("Cotizaciones — precarga al editar (R9 P0)", () => {
  test("los datos siguen cargados 1.5 s después de abrir el formulario", async ({ page }) => {
    await page.goto("/quotes", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /cotizaciones/i }).first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });

    // Lista → detalle: primera fila con folio COT-.
    const firstQuote = page.getByText(/COT-\d+/).first();
    if ((await firstQuote.count()) === 0) {
      test.skip(true, "sin cotizaciones sembradas en el entorno");
    }
    const folio = (await firstQuote.textContent())?.trim() ?? "";
    await firstQuote.click();

    // Detalle → editar.
    const editar = page.getByRole("button", { name: /editar/i }).first();
    await expect(editar).toBeVisible({ timeout: TIMEOUTS.medium });
    await editar.click();

    // El cliente debe aparecer precargado.
    const clienteVisible = page.getByText(/cliente/i).first();
    await expect(clienteVisible).toBeVisible({ timeout: TIMEOUTS.medium });

    // Snapshot de los valores de todos los inputs visibles del formulario.
    const readInputs = async (): Promise<string[]> =>
      page.locator("form input:visible").evaluateAll((els) =>
        els.map((e) => (e instanceof HTMLInputElement ? e.value : "")),
      );

    const before = await readInputs();
    const filledBefore = before.filter((v) => v.trim() !== "");
    expect(filledBefore.length, "el formulario abrió vacío: la precarga no aplicó").toBeGreaterThan(0);

    // Ventana en la que ocurría la corrupción por reset tardío.
    await page.waitForTimeout(1_500);

    const after = await readInputs();
    const filledAfter = after.filter((v) => v.trim() !== "");
    expect(
      filledAfter.length,
      `la precarga se borró tras el render inicial (${folio})`,
    ).toBeGreaterThanOrEqual(filledBefore.length);
    expect(after, "los valores precargados cambiaron solos").toEqual(before);
  });
});
