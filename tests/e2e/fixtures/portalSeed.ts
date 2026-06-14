/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures usan `use` que el lint confunde con un hook. */
import { test as base, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PortalSeed = {
  customer_id: string;
  invoice_id: string;
  invoice_number: string;
  total: number;
  scope: string;
};

type PortalConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  adminEmail: string;
  adminPassword: string;
  portalEmail: string;
  portalPassword: string;
};

// Env vars obligatorias. Validadas perezosamente al construir cada fixture,
// NUNCA al importar el módulo: cargarlas al top-level abortaba toda la suite
// (incluyendo specs que no usan portal) si faltaba E2E_PORTAL_EMAIL en CI.
function loadConfig(): PortalConfig | null {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const adminEmail = process.env.E2E_TEST_EMAIL;
  const adminPassword = process.env.E2E_TEST_PASSWORD;
  const portalEmail = process.env.E2E_PORTAL_EMAIL;
  const portalPassword = process.env.E2E_PORTAL_PASSWORD;

  if (!supabaseUrl || !supabaseKey || !adminEmail || !adminPassword || !portalEmail || !portalPassword) {
    return null;
  }
  return { supabaseUrl, supabaseKey, adminEmail, adminPassword, portalEmail, portalPassword };
}

const MISSING_ENV_MSG =
  "[e2e:portal] Faltan env vars: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, " +
  "E2E_TEST_EMAIL, E2E_TEST_PASSWORD, E2E_PORTAL_EMAIL, E2E_PORTAL_PASSWORD.";

function buildScope(testInfo: TestInfo): string {
  const worker = testInfo.workerIndex ?? 0;
  const testId = testInfo.testId.slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6);
  return `portal-w${worker}-${testId}-${rand}`;
}

async function adminClient(cfg: PortalConfig): Promise<SupabaseClient> {
  const client = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: cfg.adminEmail,
    password: cfg.adminPassword,
  });
  if (error) throw new Error(`[e2e:portal] admin login falló: ${error.message}`);
  return client;
}

/**
 * Fixture que:
 *  1. Inicia sesión como admin vía REST y siembra cliente+factura ligados al user del portal.
 *  2. Entrega los IDs al test.
 *  3. Llama `e2e_teardown(scope)` al final, sin importar si el test pasó o falló.
 */
type PortalFixtures = {
  portalSeed: PortalSeed;
  portalCreds: { email: string; password: string };
};

export const test = base.extend<PortalFixtures>({
  portalCreds: async ({ page: _page }, use) => {
    void _page;
    const cfg = loadConfig();
    if (!cfg) {
      test.skip(true, MISSING_ENV_MSG);
      return;
    }
    await use({ email: cfg.portalEmail, password: cfg.portalPassword });
  },
  portalSeed: async ({ page: _page }, use, testInfo) => {
    void _page;
    const cfg = loadConfig();
    if (!cfg) {
      test.skip(true, MISSING_ENV_MSG);
      return;
    }
    const scope = buildScope(testInfo);
    const admin = await adminClient(cfg);

    const { data, error } = await admin.rpc("e2e_seed_portal_scenario", {
      p_scope: scope,
      p_portal_email: cfg.portalEmail,
    });
    if (error) throw new Error(`e2e_seed_portal_scenario falló: ${error.message}`);
    const seed = data as PortalSeed;

    // Capturamos error del test para evitar `throw` en `finally`
    // (no-unsafe-finally) y diferenciar fallo del test vs fuga de datos.
    let testError: unknown;
    try {
      await use(seed);
    } catch (e) {
      testError = e;
    }
    const testFailed = testError !== undefined ||
      testInfo.errors.length > 0 ||
      testInfo.status === "failed" || testInfo.status === "timedOut";
    const { error: teardownError } = await admin.rpc("e2e_teardown", { p_scope: scope });
    await admin.auth.signOut().catch(() => {});
    if (teardownError) {
      if (testFailed) {
        console.error(`[e2e:portal] teardown falló scope=${scope}:`, teardownError.message);
      } else {
        throw new Error(`[e2e:portal] teardown falló scope=${scope}: ${teardownError.message}`);
      }
    }
    if (testError) throw testError;
  },
});

export { expect } from "@playwright/test";
