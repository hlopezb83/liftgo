/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures receive a `use` callback that the rule mistakes for a React Hook. */
import { test as base, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthToken } from "./helpers";

export type SeedIds = {
  model_id: string;
  forklift_id: string;
  customer_id: string;
  quote_id: string;
  quote_number: string;
  booking_id: string;
  booking_number: string;
  invoice_id: string;
  invoice_number: string;
  maintenance_log_id: string;
  total: number;
  scope: string;
};

// Requeridos como env vars en CI (job e2e) y en .env local. No hay fallback:
// embeber credenciales en el repo es un riesgo de seguridad y enmascara errores
// de configuración (un build sin VITE_* compilaría con URLs vacías sin avisar).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "[e2e] VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY son obligatorios. " +
      "Configura los secrets en CI o un .env local antes de correr Playwright.",
  );
}

async function clientFromPage(page: Page): Promise<SupabaseClient> {
  const token = await getAuthToken(page);
  if (!token) {
    throw new Error("No Supabase auth token found in localStorage. Did global.setup run?");
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Build a unique scope per test so parallel workers / sharded CI jobs do not
 * collide. Format: `w{workerIdx}-{testId8}-{rand4}`. Stored on every seeded
 * row's `e2e_scope` column; teardown deletes only rows matching this tag.
 */
function buildScope(testInfo: TestInfo): string {
  const worker = testInfo.workerIndex ?? 0;
  const testId = testInfo.testId.slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6);
  return `w${worker}-${testId}-${rand}`;
}

export async function seedScenario(page: Page, scope: string): Promise<SeedIds> {
  await page.goto("/");
  const client = await clientFromPage(page);
  const { data, error } = await client.rpc("e2e_seed_scenario", { p_scope: scope });
  if (error) throw new Error(`e2e_seed_scenario failed: ${error.message}`);
  return data as SeedIds;
}

export async function teardownScenario(page: Page, scope: string): Promise<void> {
  // Falla ruidosamente: si el teardown no corre, los datos E2E contaminan la BD demo.
  // Antes esto se tragaba con try/catch y por eso quedaban 1,400+ registros fantasma.
  const client = await clientFromPage(page);
  const { error } = await client.rpc("e2e_teardown", { p_scope: scope });
  if (error) {
    throw new Error(`[e2e_teardown:${scope}] ${error.message}`);
  }
}

/**
 * Playwright fixture that injects a scoped, parallel-safe seeded scenario
 * and cleans it up after.
 *
 * Usage:
 *   import { test } from "./fixtures/seed";
 *   test("...", async ({ page, seed }) => { ... seed.invoice_id ... });
 */
export const test = base.extend<{ seed: SeedIds }>({
  seed: async ({ page }, use, testInfo) => {
    const scope = buildScope(testInfo);
    const ids = await seedScenario(page, scope);
    // Capturamos el error del test (si lo hay) para diferenciar entre fallo
    // de test y fuga de datos del teardown. Evitamos `throw` dentro de
    // `finally` (no-unsafe-finally) capturando aquí y relanzando al final.
    let testError: unknown;
    try {
      await use(ids);
    } catch (e) {
      testError = e;
    }
    // El teardown SIEMPRE corre (equivalente a finally) para no contaminar
    // reportes financieros con datos E2E. Ver v6.47.1.
    // No revisamos `testInfo.status`: Playwright lo finaliza DESPUÉS de que
    // corren todos los fixtures de teardown, así que aquí siempre vale
    // "running". Usamos `testError` (lo que capturamos arriba) + el array de
    // errores acumulados hasta este punto.
    const testFailed = testError !== undefined || testInfo.errors.length > 0;
    let teardownError: unknown;
    try {
      await teardownScenario(page, scope);
    } catch (err) {
      teardownError = err;
    }
    if (teardownError) {
      if (testFailed) {
         
        console.error(`[e2e] teardown falló para scope=${scope}:`, teardownError);
      } else {
        throw teardownError;
      }
    }
    if (testError) throw testError;
  },
});

export { expect } from "@playwright/test";
