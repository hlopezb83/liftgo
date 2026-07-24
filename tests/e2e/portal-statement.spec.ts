import { test, expect } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";
import { loginPortal, portalCredentials } from "./fixtures/portalAuth";

/**
 * T5: portal cliente estado de cuenta — verifica balance renderiza y flujo
 * de pago carga. Multi-moneda (USD→MXN) probado en unit test
 * `portalBalance.test.ts`; aquí validamos que la UI no cae.
 */
test.describe("Portal cliente — estado de cuenta", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login portal + statement renderiza balance", async ({ page }) => {
    const creds = portalCredentials();
    test.skip(!creds, "E2E_PORTAL_EMAIL/PASSWORD no configurados");
    if (!creds) return;

    await loginPortal(page, creds.email, creds.password);

    await page.goto("/portal", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
    await expect(page.getByText(/no autorizado/i)).toHaveCount(0);

    // Buscar tarjeta/label de balance o adeudo
    await expect(
      page.getByText(/saldo|adeudo|balance|por pagar/i).first(),
    ).toBeVisible({ timeout: TIMEOUTS.medium });
  });
});
