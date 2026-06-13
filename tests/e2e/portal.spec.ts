import { test, expect } from "./fixtures/portalSeed";

/**
 * Portal de clientes — corre sin storageState de admin (proyecto propio en playwright.config.ts).
 *
 * 1. Smoke: la página pública de login carga.
 * 2. Flujo real: login con credenciales del portal + factura sembrada visible en /portal/invoices.
 *    El seed crea el cliente vinculado al user `E2E_PORTAL_EMAIL` y limpia con `e2e_teardown`.
 */
test.describe("Customer portal", () => {
  test("portal login page loads", async ({ page }) => {
    await page.goto("/portal/login");
    await expect(
      page.getByRole("button", { name: /entrar|iniciar|acceder|sign in/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("portal customer sees assigned invoice", async ({ page, portalSeed, portalCreds }) => {
    await page.goto("/portal/login");

    await page.getByLabel(/correo/i).fill(portalCreds.email);
    await page.getByLabel(/contraseña/i).fill(portalCreds.password);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    // Tras login el AuthGuard redirige según rol; navegamos explícitamente a facturas.
    await page.waitForURL((url) => url.pathname.startsWith("/portal"), { timeout: 15_000 });
    await page.goto("/portal/invoices");

    await expect(page.getByText(portalSeed.invoice_number)).toBeVisible({ timeout: 15_000 });
  });
});
