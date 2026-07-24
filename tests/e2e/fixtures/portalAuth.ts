import { expect, type Page } from "@playwright/test";
import { signIn, waitForAuthToken } from "./helpers";

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
  await page.context().clearCookies();
  await page.goto("/portal/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /portal|cliente|iniciar/i }).first())
    .toBeVisible({ timeout: 15_000 });
  await signIn(page, email, password);
  await waitForAuthToken(page);
  await page.waitForURL(/\/portal(\/|$)/, { timeout: 20_000 });
}
