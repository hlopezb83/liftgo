import { test, expect } from "@playwright/test";

/**
 * Smoke test: every critical route loads without throwing an error boundary.
 * We do NOT assert specific copy because labels change — only that the page
 * renders and the global error boundary did not catch.
 */
const ROUTES = [
  "/",
  "/fleet",
  "/customers",
  "/quotes",
  "/bookings",
  "/invoices",
  "/maintenance",
  "/reports",
  "/calendar",
  "/crm",
  // Lote 12 — rutas secundarias
  "/contracts",
  "/suppliers",
  "/inventory",
  "/mrr",
  "/income-statement",
  "/expenses",
  "/damage",
  "/returns",
  "/deliveries",
  "/activity",
  "/audit",
  "/crm/cerrados",
  "/settings",
  "/settings/operations",
  "/users",
  "/users/permissions",
  "/changelog",
  "/help",
  "/mis-reportes",
  "/leaderboard",
  "/feedback",
];

test.describe("Smoke navigation", () => {
  for (const path of ROUTES) {
    test(`route ${path} renders without error boundary`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(path, { waitUntil: "domcontentloaded" });

      await expect(
        page.getByText(/algo salió mal|error boundary|something went wrong/i)
      ).toHaveCount(0);
      await expect(page.getByText("404").first()).toHaveCount(0);

      expect(errors, `Uncaught errors on ${path}: ${errors.join(" | ")}`).toEqual([]);
    });
  }
});
