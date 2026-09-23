import { expect, type Page } from "@playwright/test";
import { signIn, waitForAuthToken, TIMEOUTS } from "./helpers";

/**
 * Helper de login para el portal cliente (/portal/login).
 *
 * Requiere env vars — si faltan, el spec debe skipearse con motivo explícito
 * (no silenciosamente):
 *   E2E_PORTAL_EMAIL
 *   E2E_PORTAL_PASSWORD
 */
export function portalCredentials(): { email: string; password: string } | null {
  const email = process.env.E2E_PORTAL_EMAIL;
  const password = process.env.E2E_PORTAL_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export async function loginPortal(page: Page, email: string, password: string): Promise<void> {
  let authenticated = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2 && !authenticated; attempt++) {
    await page.context().clearCookies();
    await page.goto("/portal/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.clear());
    await expect(page.getByRole("heading", { name: /portal|cliente|iniciar/i }).first())
      .toBeVisible({ timeout: TIMEOUTS.long });
    await signIn(page, email, password);
    try {
      await waitForAuthToken(page, TIMEOUTS.long);
      authenticated = true;
    } catch (error) {
      lastError = error;
    }
  }
  if (!authenticated) throw lastError;
  // PortalLogin redirige a "/" tras auth; el router de cliente resuelve luego
  // a /portal. Aceptamos ambos para no depender del timing exacto del segundo
  // redirect (v7.224.4).
  await page.waitForURL(/\/(portal(\/|$)|$)/, { timeout: TIMEOUTS.xl });
}
