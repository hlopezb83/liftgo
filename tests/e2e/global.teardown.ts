/**
 * Playwright global teardown — red final de limpieza E2E.
 *
 * Aunque cada test invoca `teardownScenario` por scope (con try/finally desde
 * v6.47.1), si Playwright mata el proceso entero, el navegador se cae o un
 * spec sin el fixture `seed` crea filas tagueadas como E2E, los registros
 * quedan en la BD demo y se cuelan a reportes (ver `get_income_statement`).
 *
 * Este teardown llama al RPC admin `purge_e2e_data` que borra TODA fila con
 * `is_e2e = true` en orden seguro de FK. Se ejecuta una sola vez al terminar
 * la suite (no es per-worker).
 *
 * Requiere credenciales admin (mismas vars que `global.setup.ts`).
 */
import { createClient } from "@supabase/supabase-js";
import { assertNonProductionBackend } from "./fixtures/productionGuard";
import { isShardedRun } from "./fixtures/cleanupPolicy";

export default async function globalTeardown(): Promise<void> {
  // Guard fail-closed ANTES del login y del purge: purge_e2e_data es destructivo.
  assertNonProductionBackend("global.teardown");
  if (isShardedRun() && process.env.E2E_FINAL_CLEANUP !== "1") {
    throw new Error("[e2e] La limpieza global requiere que TODOS los shards hayan terminado. Usa el paso final separado.");
  }
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!SUPABASE_URL || !SUPABASE_KEY || !email || !password) {
     
    throw new Error("[e2e] globalTeardown: faltan variables para limpiar el entorno aislado.");
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) {
     
    throw new Error("[e2e] globalTeardown: login falló: " + authError.message);
  }

  const { data, error } = await client.rpc("purge_e2e_data");
  if (error) {
     
    throw new Error("[e2e] globalTeardown: purge_e2e_data falló: " + error.message);
  } else {
     
    console.log("[e2e] globalTeardown: purge_e2e_data OK", data);
  }

  // Este paso sólo corre sin shards o desde la limpieza final explícita.
  const { error: disableError } = await client
    .from("company_settings")
    .update({ allow_e2e_seed: false })
    .neq("allow_e2e_seed", false);
  if (disableError) {
     
    throw new Error("[e2e] globalTeardown: no se pudo apagar allow_e2e_seed: " + disableError.message);
  } else {
     
    console.log("[e2e] globalTeardown: allow_e2e_seed apagado");
  }
}
