import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test as setup, expect } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";
import {
  assertIsStaffUser,
  buildStorageState,
  ensureRoleStorageState,
  supabaseEnv,
  signInViaApi,
} from "./fixtures/apiAuth";

const STORAGE_PATH = "tests/e2e/.auth/admin.json";

/**
 * Fase 4: autenticación por API en vez de por UI.
 *
 * Pedimos la sesión a Supabase (`signInWithPassword`) y escribimos el
 * storageState directo a disco. Después abrimos UNA página para confirmar que
 * la app hidrata la sesión — si no, fallamos loud antes de correr la suite.
 */
setup("authenticate as admin", async ({ page, baseURL }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars. " +
        "Set them locally in .env.local or as GitHub Actions secrets.",
    );
  }

  const url = baseURL ?? "http://localhost:4173";
  const session = await signInViaApi(email, password);
  // FAIL LOUDLY si la cuenta configurada es del Portal de Clientes.
  await assertIsStaffUser(session, email);

  mkdirSync(dirname(STORAGE_PATH), { recursive: true });
  writeFileSync(STORAGE_PATH, JSON.stringify(buildStorageState(session, url), null, 2));

  // Verificación end-to-end de que la sesión inyectada sirve en el navegador.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem("liftgo:e2e-visible", "1");
    },
    [supabaseEnv().storageKey, JSON.stringify(session)] as const,
  );
  // Recargamos con la sesión ya presente y exigimos el shell autenticado.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Iniciar Sesión" })).toHaveCount(0, {
    timeout: TIMEOUTS.long,
  });
  await expect(page.locator("nav, [role='navigation']").first()).toBeVisible({
    timeout: TIMEOUTS.long,
  });

  // storageState cacheado por rol para roles-matrix.spec.ts (opcional).
  const ROLES = ["ventas", "administrativo", "mecanico"] as const;
  for (const role of ROLES) {
    const rEmail = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
    const rPassword = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];
    if (!rEmail || !rPassword) continue;
    await ensureRoleStorageState(role, rEmail, rPassword, url);
  }
});
