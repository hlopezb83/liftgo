import { test, expect } from "@playwright/test";

/**
 * Quote → Invoice placeholder.
 *
 * Full path (open accepted quote → "Generar factura" → invoice draft appears)
 * needs a seeded accepted quote per run. Skipped until E2E seed RPC exists.
 */
test.describe("Quote → Invoice", () => {
  test("quotes list loads", async ({ page }) => {
    await page.goto("/cotizaciones");
    await expect(page.getByRole("heading", { name: /cotizaciones/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("invoices list loads", async ({ page }) => {
    await page.goto("/facturas");
    await expect(page.getByRole("heading", { name: /facturas/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test.skip("generate invoice from accepted quote", async () => {
    // TODO: requires seed RPC that returns an accepted quote id.
  });
});
