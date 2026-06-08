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

  // Dashboard or any authenticated layout
  await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 20_000 });

  mkdirSync(dirname(STORAGE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_PATH });
});
