// Auth compartida para funciones cron (Lote C · DIFF 8 rest).
//
// Consolida la validación de `CRON_SECRET` / service_role que estaba duplicada
// en `process-cfdi-retry-queue`, `reconcile-stamping-invoices` y
// `generate-recurring-maintenance`. Usa comparación timing-safe para evitar
// side-channels por longitud de comparación de strings.
//
// Fuentes válidas (en orden):
//   1. Header `x-cron-secret: <CRON_SECRET>` (uso recomendado desde pg_cron)
//   2. `Authorization: Bearer <CRON_SECRET>` (compat Scheduled Functions)
//   3. `Authorization: Bearer <service_role>` (llamadas administrativas)
//
// `CRON_SECRET` se resuelve desde `Deno.env`; si está vacío, cae a la RPC
// `internal_get_cron_secret()` para mantener paridad con pg_cron+Vault.

import { getAdminClient } from "./supabaseClients.ts";

export type CronAuthResult =
  | { ok: true; via: "cron_secret" | "service_role" }
  | { ok: false; status: number; error: string };

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Comparación bit a bit sin early-exit; XOR acumulativo.
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface CronAuthOptions {
  /** Inyectable en tests para no abrir un cliente Supabase real. */
  getVaultSecret?: () => Promise<string>;
}

async function defaultVaultSecret(): Promise<string> {
  try {
    const admin = getAdminClient();
    const { data } = await admin.rpc("internal_get_cron_secret");
    return typeof data === "string" ? data : "";
  } catch {
    // Vault opcional; si falla seguimos con el secreto del entorno.
    return "";
  }
}

export async function authenticateCronRequest(
  req: Request,
  opts: CronAuthOptions = {},
): Promise<CronAuthResult> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  const matches = (secret: string) =>
    secret.length > 0 &&
    (timingSafeEqualStr(headerSecret, secret) ||
      timingSafeEqualStr(bearer, secret));

  // FIX 401-CRON: antes sólo consultábamos el Vault cuando `CRON_SECRET` del
  // entorno estaba vacío. En producción existían AMBOS con valores distintos
  // (pg_cron firma con el del Vault) y toda llamada terminaba en 401.
  // Ahora aceptamos cualquiera de los dos secretos válidos.
  const envSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (matches(envSecret)) return { ok: true, via: "cron_secret" };

  if (serviceKey.length > 0 && timingSafeEqualStr(bearer, serviceKey)) {
    return { ok: true, via: "service_role" };
  }

  const vaultSecret = await (opts.getVaultSecret ?? defaultVaultSecret)();
  if (matches(vaultSecret)) return { ok: true, via: "cron_secret" };



  return { ok: false, status: 401, error: "Unauthorized" };
}

