// Fábricas centralizadas de clientes Supabase para Edge Functions.
// Elimina la duplicación de `Deno.env.get("SUPABASE_URL")` + `createClient(...)`
// repartida por 15+ funciones. Cualquier cambio de env vars o de versión del
// SDK se hace aquí una sola vez.
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

export function getSupabaseEnv(): { url: string; anonKey: string; serviceKey: string } {
  return {
    url: Deno.env.get("SUPABASE_URL")!,
    anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };
}

/** Cliente con service role. Bypass RLS. Uso interno / trabajos administrativos. */
export function getAdminClient(): SupabaseClient {
  const { url, serviceKey } = getSupabaseEnv();
  return createClient(url, serviceKey);
}

/**
 * Cliente que actúa como el caller. Reenvía el header `Authorization` para que
 * RLS y `auth.getClaims()` funcionen contra la sesión del usuario.
 */
export function getCallerClient(req: Request): SupabaseClient {
  const { url, anonKey } = getSupabaseEnv();
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}
