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
test.setTimeout(60_000);

test("download PDF from seeded quote produces a COT-*.pdf file", async ({ page, seed }) => {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });

  await page.goto(`/quotes/${seed.quote_id}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await expect(page.getByText(seed.quote_number).first()).toBeVisible({ timeout: 15_000 });

  const pdfButton = page.getByRole("button", { name: /descargar pdf|pdf/i }).first();
  await expect(pdfButton).toBeEnabled({ timeout: 15_000 });

  // Capturar el evento download en paralelo con el click para evitar race.
  // Timeout amplio: `@react-pdf/renderer` es un chunk lazy de ~1.46 MB y en
  // cold-start de CI la primera descarga puede tardar >20 s.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 45_000 }),
    pdfButton.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^(E2E-)?COT-/i);
});
