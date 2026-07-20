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

export default async function globalTeardown(): Promise<void> {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!SUPABASE_URL || !SUPABASE_KEY || !email || !password) {
     
    console.warn("[e2e] globalTeardown: faltan env vars, se omite purge_e2e_data.");
    return;
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) {
     
    console.error("[e2e] globalTeardown: login falló, se omite purge_e2e_data:", authError.message);
    return;
  }

  const { data, error } = await client.rpc("purge_e2e_data");
  if (error) {
     
    console.error("[e2e] globalTeardown: purge_e2e_data falló:", error.message);
    return;
  }

   
  console.log("[e2e] globalTeardown: purge_e2e_data OK", data);
}
