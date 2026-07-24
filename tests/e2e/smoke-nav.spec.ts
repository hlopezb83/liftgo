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
  "/expenses", // redirect → /cuentas-por-pagar
  // TESTS-ARQ2 (v7.220.0 DIFF 13): módulos financieros ausentes en smoke.
  "/cuentas-por-pagar",
  "/cuentas-por-pagar/antiguedad",
  "/flujo-de-caja",
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

      // Aserción de landmark: la página debe renderizar contenido real, no
      // quedar en blanco. Antes el test pasaba con un body vacío.
      await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible({
        timeout: 7_000,
      });

      expect(errors, `Uncaught errors on ${path}: ${errors.join(" | ")}`).toEqual([]);
    });
  }
});

test.describe("Smoke navigation — mobile viewport", () => {
  // Subset crítico en mobile (375x812 iPhone-like) para validar MobileCardList
  // y layout responsivo del sidebar colapsado.
  const MOBILE_ROUTES = ["/", "/customers", "/bookings", "/invoices", "/fleet"];

  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of MOBILE_ROUTES) {
    test(`mobile route ${path} renders sin overflow horizontal`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(path, { waitUntil: "domcontentloaded" });

      await expect(page.locator("main, [role='main'], h1, h2").first()).toBeVisible({
        timeout: 7_000,
      });

      // Validar que no hay scroll horizontal (síntoma de tabla sin
      // MobileCardList).
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `overflow horizontal en ${path}`).toBeLessThanOrEqual(clientWidth + 1);

      expect(errors, `Uncaught errors mobile ${path}: ${errors.join(" | ")}`).toEqual([]);
    });
  }
});
