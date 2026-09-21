/**
 * Aislamiento del PORTAL en navegador con dos organizaciones.
 * Cada portal ve solo su factura/documento y el id ajeno no revela nada.
 */

import { expect, test, type Page } from "@playwright/test";
import { readAbContext, type AbSide } from "./fixtures/abSeed";
import { assertLocalEphemeralBackend } from "./fixtures/localBackend";

const ctx = readAbContext();

test.beforeAll(() => {
  assertLocalEphemeralBackend("portal-isolation");
});

async function portalLogin(page: Page, side: AbSide): Promise<void> {
  await page.goto("/portal/login");
  await page.getByLabel("Correo electrónico").fill(side.portal.email);
  await page.getByLabel(/contraseña/i).first().fill(side.portal.password);
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/portal/login"), { timeout: 30_000 });
}

test.describe("portal A/B", () => {
  test("el portal de A solo muestra la factura de A", async ({ page }) => {
    await portalLogin(page, ctx.A);
    await page.goto("/portal/invoices");
    await expect(page.getByText(ctx.A.invoiceNumber)).toBeVisible();
    await expect(page.getByText(ctx.B.invoiceNumber)).toHaveCount(0);
  });

  test("el portal de B solo muestra la factura de B", async ({ page }) => {
    await portalLogin(page, ctx.B);
    await page.goto("/portal/invoices");
    await expect(page.getByText(ctx.B.invoiceNumber)).toBeVisible();
    await expect(page.getByText(ctx.A.invoiceNumber)).toHaveCount(0);
  });

  test("abrir una factura de la otra empresa no revela monto ni nombre", async ({ page }) => {
    await portalLogin(page, ctx.A);
    await page.goto(`/portal/invoices/${ctx.B.invoiceId}`);
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
        const brand = page.getByAltText(/liftgo/i).first();
        await expect(brand).toBeVisible();
        await expect(brand).toHaveAttribute("src", /liftgo-montacargas/i);
      } finally {
        await context.close();
      }
    }
  });
});

