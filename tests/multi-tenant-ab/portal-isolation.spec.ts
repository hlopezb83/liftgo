/**
 * Aislamiento del PORTAL en navegador con dos organizaciones.
 * Cada portal ve solo su factura/documento y el id ajeno no revela nada.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginPortal } from "../e2e/fixtures/portalAuth";
import { readAbContext, type AbSide } from "./fixtures/abSeed";
import { assertLocalEphemeralBackend } from "./fixtures/localBackend";

const ctx = readAbContext();

test.beforeAll(() => {
  assertLocalEphemeralBackend("portal-isolation");
});

/**
 * Login del portal con el patrón robusto compartido de E2E: signIn +
 * waitForAuthToken (la sesión queda persistida antes de continuar) y espera
 * de URL fuera de /portal/login. El helper artesanal anterior solo esperaba
 * el cambio de URL y podía navegar antes de que la sesión existiera, por lo
 * que la página renderizaba sin el layout autenticado.
 */
async function portalLogin(page: Page, side: AbSide): Promise<void> {
  await loginPortal(page, side.portal.email, side.portal.password);
}

/**
 * Señal inequívoca de portal autenticado: la URL no es /portal/login y el
 * layout del portal (botón "Cerrar Sesión") ya está visible. Se exige antes
 * de cualquier aserto A/B para que una pantalla de login o una carga a medio
 * hacer no puedan pasar los asertos negativos falsamente.
 */
async function expectAuthenticatedPortal(page: Page): Promise<void> {
  expect(page.url()).not.toContain("/portal/login");
  await expect(page.getByRole("button", { name: "Cerrar Sesión" })).toBeVisible();
}

test.describe("portal A/B", () => {
  test("el portal de A solo muestra la factura de A", async ({ page }) => {
    await portalLogin(page, ctx.A);
    await page.goto("/portal/invoices");
    await expectAuthenticatedPortal(page);
    await expect(page.getByText(ctx.A.invoiceNumber)).toBeVisible();
    await expect(page.getByText(ctx.B.invoiceNumber)).toHaveCount(0);
  });

  test("el portal de B solo muestra la factura de B", async ({ page }) => {
    await portalLogin(page, ctx.B);
    await page.goto("/portal/invoices");
    await expectAuthenticatedPortal(page);
    await expect(page.getByText(ctx.B.invoiceNumber)).toBeVisible();
    await expect(page.getByText(ctx.A.invoiceNumber)).toHaveCount(0);
  });

  test("abrir una factura de la otra empresa no revela monto ni nombre", async ({ page }) => {
    await portalLogin(page, ctx.A);
    await page.goto(`/portal/invoices/${ctx.B.invoiceId}`);
    // El layout autenticado debe estar visible ANTES de los asertos negativos:
    // sin esta señal, una pantalla de login podría pasar la prueba falsamente.
    await expectAuthenticatedPortal(page);
    const body = page.locator("body");
    await expect(body).not.toContainText(ctx.B.invoiceNumber);
    await expect(body).not.toContainText(ctx.B.organizationName);
    await expect(body).not.toContainText("7,890.12");
  });

  test("el mismo logo global LiftGo aparece en ambos portales", async ({ browser }) => {
    // Un contexto de navegador por empresa: `clearCookies()` no borra la sesión
    // de Supabase guardada en localStorage y dejaría viva la sesión de A.
    for (const side of [ctx.A, ctx.B]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await portalLogin(page, side);
        await page.goto("/portal/invoices");
        await expectAuthenticatedPortal(page);
        const brand = page.getByAltText(/liftgo/i).first();
        await expect(brand).toBeVisible();
        await expect(brand).toHaveAttribute("src", /liftgo-montacargas/i);
      } finally {
        await context.close();
      }
    }
  });
});

