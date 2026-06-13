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

    await page.locator('input[type="email"]').fill(portalCreds.email);
    await page.locator('input[type="password"]').fill(portalCreds.password);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();

    // Esperar el shell real del portal; /portal/login también empieza con /portal y causaba carrera.
    await expect(page.getByText(/Lift Go - Portal/i)).toBeVisible({ timeout: 15_000 });
    await page.goto("/portal/invoices");

    await expect(page.getByText(portalSeed.invoice_number)).toBeVisible({ timeout: 15_000 });
  });
});
