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

// Env vars obligatorias — sin fallbacks. Embeber credenciales enmascara errores.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const ADMIN_EMAIL = process.env.E2E_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_TEST_PASSWORD;
const PORTAL_EMAIL = process.env.E2E_PORTAL_EMAIL;
const PORTAL_PASSWORD = process.env.E2E_PORTAL_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || !PORTAL_EMAIL || !PORTAL_PASSWORD) {
  throw new Error(
    "[e2e:portal] Faltan env vars: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, " +
      "E2E_TEST_EMAIL, E2E_TEST_PASSWORD, E2E_PORTAL_EMAIL, E2E_PORTAL_PASSWORD.",
  );
}

function buildScope(testInfo: TestInfo): string {
  const worker = testInfo.workerIndex ?? 0;
  const testId = testInfo.testId.slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6);
  return `portal-w${worker}-${testId}-${rand}`;
}

async function adminClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (error) throw new Error(`[e2e:portal] admin login falló: ${error.message}`);
  return client;
}

/**
 * Fixture que:
 *  1. Inicia sesión como admin vía REST y siembra cliente+factura ligados al user del portal.
 *  2. Entrega los IDs al test.
 *  3. Llama `e2e_teardown(scope)` al final, sin importar si el test pasó o falló.
 *
 * Las credenciales del portal viven en env vars; el test hace login UI por separado.
 */
export const test = base.extend<{ portalSeed: PortalSeed; portalCreds: { email: string; password: string } }>({
  portalCreds: async ({}, use) => {
    await use({ email: PORTAL_EMAIL!, password: PORTAL_PASSWORD! });
  },
  portalSeed: async ({}, use, testInfo) => {
    const scope = buildScope(testInfo);
    const admin = await adminClient();

    const { data, error } = await admin.rpc("e2e_seed_portal_scenario", {
      p_scope: scope,
      p_portal_email: PORTAL_EMAIL!,
    });
    if (error) throw new Error(`e2e_seed_portal_scenario falló: ${error.message}`);
    const seed = data as PortalSeed;

    try {
      await use(seed);
    } finally {
      const { error: teardownError } = await admin.rpc("e2e_teardown", { p_scope: scope });
      if (teardownError) {
         
        console.error(`[e2e:portal] teardown falló scope=${scope}:`, teardownError.message);
      }
      await admin.auth.signOut().catch(() => {});
    }
  },
});

export { expect } from "@playwright/test";
