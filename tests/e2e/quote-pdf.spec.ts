import { test, expect } from "./fixtures/seed";

/**
 * Quote PDF download happy path.
 *
 * Abre la cotización sembrada y verifica que el botón "Descargar PDF"
 * dispara un evento de descarga con prefijo COT-.
 *
 * Sin `test.skip` condicionales: silenciar fallos con skip oculta regresiones
 * reales (causa del flaky observado en CI). Si el botón o el evento no se
 * disparan, el test debe FALLAR para que el equipo lo investigue.
 */
test("download PDF from seeded quote produces a COT-*.pdf file", async ({ page, seed }) => {
  await page.goto(`/quotes/${seed.quote_id}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await expect(page.getByText(seed.quote_number).first()).toBeVisible({ timeout: 15_000 });

  const pdfButton = page.getByRole("button", { name: /descargar pdf|pdf/i }).first();
  await expect(pdfButton).toBeVisible({ timeout: 10_000 });

  // Capturar el evento download en paralelo con el click para evitar race.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    pdfButton.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^(E2E-)?COT-/i);
});
