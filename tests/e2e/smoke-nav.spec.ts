import { test, expect } from "@playwright/test";

/**
 * Smoke test: every critical route loads without throwing an error boundary.
 * We do NOT assert specific content because copy may change — only that the
 * page renders and the global error boundary did not catch.
 */
const ROUTES = [
  "/",
  "/flota",
  "/clientes",
  "/cotizaciones",
  "/reservas",
  "/facturas",
  "/mantenimiento",
  "/reportes",
];

test.describe("Smoke navigation", () => {
  for (const path of ROUTES) {
    test(`route ${path} renders without error boundary`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(path, { waitUntil: "domcontentloaded" });

      // App-level error boundary fallback text (defensive: not asserting copy)
      await expect(page.getByText(/algo salió mal|error boundary|something went wrong/i)).toHaveCount(0);

      // No uncaught page errors
      expect(errors, `Uncaught page errors on ${path}: ${errors.join(" | ")}`).toEqual([]);
    });
  }
});
