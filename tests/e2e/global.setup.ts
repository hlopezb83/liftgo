import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const STORAGE_PATH = "tests/e2e/.auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars. " +
        "Set them locally in .env.local or as GitHub Actions secrets."
    );
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Iniciar Sesión" })).toBeVisible({ timeout: 15_000 });

  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /iniciar sesión|entrar|sign in/i }).click();

  // Esperar redirección post-login a una ruta de admin. Antes usábamos
  // `waitForLoadState("networkidle").catch(() => {})`, que silenciaba timeouts
  // reales (un login fallido continuaba con storageState vacío).
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });

  // FAIL LOUDLY if the configured user is a Customer Portal account.
  // The admin area lives at "/" or "/dashboard"; portal users get redirected to "/portal/*".
  const url = new URL(page.url());
  if (url.pathname.startsWith("/portal")) {
    throw new Error(
      `E2E_TEST_EMAIL (${email}) is a Customer Portal user — landed on ${url.pathname}. ` +
        "Use an admin account (role 'admin' in public.user_roles) instead."
    );
  }
  // Also detect the portal banner just in case the URL hasn't updated yet.
  const portalBanner = await page.getByText(/Lift Go - Portal/i).count();
  if (portalBanner > 0) {
    throw new Error(
      `E2E_TEST_EMAIL (${email}) logged into the Customer Portal layout. ` +
        "Use an admin account (role 'admin' in public.user_roles) instead."
    );
  }

  // Dashboard or any authenticated admin layout
  await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 20_000 });
  // Wait until the auth screen is gone and the app shell rendered, so that
  // Supabase has finished persisting the session to localStorage.
  await expect(page.getByRole("heading", { name: "Iniciar Sesión" })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator("nav, [role='navigation']").first()).toBeVisible({ timeout: 15_000 });
  // Extra settle time for any pending storage writes.
  await page.waitForTimeout(500);

  mkdirSync(dirname(STORAGE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_PATH, indexedDB: true });
});
