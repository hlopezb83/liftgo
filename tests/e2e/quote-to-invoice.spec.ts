import { test, expect } from "@playwright/test";

/**
 * Quote → Invoice placeholder.
 *
 * Full path (open accepted quote → "Generar factura" → invoice draft appears)
 * needs a seeded accepted quote per run. Skipped until E2E seed RPC exists.
 */
test.describe("Quote → Invoice", () => {
  test("quotes list loads", async ({ page }) => {
    await page.goto("/quotes", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").filter({ hasText: /cotizaciones/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("invoices list loads", async ({ page }) => {
    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").filter({ hasText: /facturas/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test.skip("generate invoice from accepted quote", async () => {
    // TODO: requires seed RPC that returns an accepted quote id.
  });
});
