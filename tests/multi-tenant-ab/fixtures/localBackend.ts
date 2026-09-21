/**
 * Gate multiempresa A/B — resolución de backend LOCAL y efímero.
 *
 * Este módulo es el ÚNICO punto por el que la suite A/B obtiene URL y llaves.
 * Endurece (no sustituye) `tests/e2e/fixtures/productionGuard.ts`:
 *
 *   1. Reutiliza `assertNonProductionBackend`: lista negra del ref productivo,
 *      destino obligatorio, `E2E_ISOLATED_BACKEND=1` y host local.
 *   2. Prohíbe el escape remoto: si `E2E_ALLOW_REMOTE_BACKEND` está definido
 *      con cualquier valor, la suite aborta. Este gate NO admite backends
 *      remotos "aislados".
 *   3. Exige que TODAS las URLs configuradas sean loopback y que los
 *      identificadores de proyecto (`*_PROJECT_ID`) sean locales.
 *
 * Fail-closed: cualquier duda aborta ANTES de login, seed, upload o escritura.
 * No contiene ningún valor productivo ni credencial versionada.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  PRODUCTION_PROJECT_REFS,
  assertNonProductionBackend,
  assertUrlNotProduction,
  resolveEnvValue,
} from "../../e2e/fixtures/productionGuard";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const URL_VARS = ["VITE_SUPABASE_URL", "SUPABASE_URL", "E2E_SUPABASE_URL"] as const;
const PROJECT_ID_VARS = ["VITE_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID"] as const;

function abort(reason: string): never {
  throw new Error(
    `[ab-gate] BLOQUEADO: ${reason}\n` +
      "El gate multiempresa A/B solo corre contra el Supabase LOCAL efímero del runner " +
      "(loopback, credenciales generadas por la CLI). Exporta E2E_ISOLATED_BACKEND=1, " +
      "VITE_SUPABASE_URL/SUPABASE_URL locales y VITE_SUPABASE_PROJECT_ID/SUPABASE_PROJECT_ID " +
      "con un identificador local. No existe modo remoto para esta suite.",
  );
}

/** Verificación reforzada. Llamar antes de crear cualquier cliente. */
export function assertLocalEphemeralBackend(context: string): void {
  // Capa 1: el guard histórico, tal cual (incluye la lista negra productiva).
  assertNonProductionBackend(`ab-gate:${context}`);

  // Capa 2: sin escape remoto, ni siquiera declarado.
  if (process.env.E2E_ALLOW_REMOTE_BACKEND !== undefined) {
    abort("E2E_ALLOW_REMOTE_BACKEND está definido; esta suite no admite backends remotos.");
  }

  // Capa 3: toda URL configurada debe ser loopback.
  let seenUrl = false;
  for (const name of URL_VARS) {
    const value = resolveEnvValue(name);
    if (!value) continue;
    seenUrl = true;
    assertUrlNotProduction(`ab-gate:${context}`, name, value);
    let hostname: string;
    try {
      hostname = new URL(value).hostname.toLowerCase();
    } catch {
      abort(`${name} no es una URL válida.`);
    }
    if (!LOOPBACK_HOSTS.has(hostname)) {
      abort(`${name} apunta a ${hostname}; solo se aceptan hosts loopback.`);
    }
  }
  if (!seenUrl) abort("no hay ninguna URL local de Supabase configurada.");

  // Capa 4: identificadores de proyecto explícitamente locales.
  for (const name of PROJECT_ID_VARS) {
    const value = resolveEnvValue(name);
    if (!value) abort(`falta ${name} con un identificador local explícito.`);
    const lowered = value.toLowerCase();
    for (const ref of PRODUCTION_PROJECT_REFS) {
      if (lowered.includes(ref)) abort(`${name} contiene el ref productivo bloqueado.`);
    }
    if (!lowered.startsWith("local")) {
      abort(`${name} debe empezar con "local" (recibido: identificador no local).`);
    }
  }
}

function requireEnv(name: string): string {
  const value = resolveEnvValue(name);
  if (!value) abort(`falta ${name}.`);
  return value;
}

export function localSupabaseUrl(context: string): string {
  assertLocalEphemeralBackend(context);
  return requireEnv("VITE_SUPABASE_URL");
}

/** Cliente anónimo local: el mismo que usa el navegador. */
export function createLocalAnonClient(context: string): SupabaseClient {
  const url = localSupabaseUrl(context);
  const anonKey = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente admin local (service_role de la CLI efímera). Solo para el seed. */
export function createLocalAdminClient(context: string): SupabaseClient {
  const url = localSupabaseUrl(context);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente autenticado como un usuario concreto del backend local. */
export async function createLocalUserClient(
  context: string,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createLocalAnonClient(context);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`[ab-gate] No se pudo iniciar sesión local para el rol "${context}".`);
  }
  return client;
}
