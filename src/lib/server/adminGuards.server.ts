/**
 * Guards compartidos para los server functions administrativos.
 *
 * Portados 1:1 desde `supabase/functions/_shared/auth.ts` + `validate.ts` al
 * runtime de TanStack Start. Mismas reglas, mismos mensajes en español: sólo
 * cambia el transporte (antes Edge Function HTTP, ahora server function RPC).
 */
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type AdminClient = SupabaseClient<Database>;
/** Cliente que actúa como el usuario autenticado (RLS aplicada). */
export type CallerClient = SupabaseClient<Database>;

/** Error con status HTTP lógico; el mensaje es lo que ve la interfaz. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

// ---------- Validadores (portados de _shared/validate.ts) ----------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length < 6 || v.length > 254) return false;
  const [local] = v.split("@");
  if (
    !local || local.startsWith(".") || local.endsWith(".") ||
    local.includes("..")
  ) return false;
  return EMAIL_RE.test(v);
}

export function isNonEmptyString(v: unknown, maxLen = 500): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

const VALID_ROLES = [
  "admin",
  "administrativo",
  "dispatcher",
  "mechanic",
  "auditor",
  "ventas",
] as const;

export function isValidRole(v: unknown): v is AppRole {
  return typeof v === "string" &&
    (VALID_ROLES as readonly string[]).includes(v);
}

// ---------- Contraseñas ----------

/**
 * Rejection sampling para evitar el bias de `% charset.length`.
 * Portado de `_shared/auth.ts`.
 */
export function generateSecurePassword(length = 20): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const max = Math.floor(256 / charset.length) * charset.length;
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    const byte = buf[0] ?? 0;
    if (byte < max) out.push(charset.charAt(byte % charset.length));
  }
  return out.join("");
}

// ---------- Autorización ----------

export interface AuthorizedCaller {
  userId: string;
  role: AppRole;
  admin: AdminClient;
}

/**
 * Exige que el caller autenticado esté activo y tenga uno de los roles.
 *
 * El rol se decide con el cliente del propio usuario (`has_role`, SECURITY
 * DEFINER), nunca con el cliente privilegiado. Éste último sólo se carga
 * después de aprobar el guard.
 */
export async function requireRole(
  caller: CallerClient,
  userId: string,
  roles: AppRole[],
): Promise<AuthorizedCaller> {
  // SEC-M2: un JWT sigue siendo válido aunque la cuenta esté desactivada.
  const { data: active, error: activeErr } = await caller.rpc(
    "is_active_user",
    { _user_id: userId },
  );
  if (activeErr) {
    console.error("[guards] is_active_user falló, fail-closed:", activeErr.message);
    throw new HttpError(
      503,
      "Servicio de verificación de cuenta no disponible. Reintenta en unos segundos.",
    );
  }
  if (active === false) throw new HttpError(403, "Cuenta desactivada");

  let matched: AppRole | null = null;
  for (const role of roles) {
    const { data: ok, error } = await caller.rpc("has_role", {
      _user_id: userId,
      _role: role,
    });
    if (error) {
      console.error("[guards] has_role falló, fail-closed:", error.message);
      throw new HttpError(
        503,
        "Servicio de verificación de permisos no disponible. Reintenta en unos segundos.",
      );
    }
    if (ok === true) {
      matched = role;
      break;
    }
  }
  if (!matched) throw new HttpError(403, "Forbidden: insufficient role");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { userId, role: matched, admin: supabaseAdmin as AdminClient };
}

/** Atajo: exige rol admin. */
export function requireAdmin(
  caller: CallerClient,
  userId: string,
): Promise<AuthorizedCaller> {
  return requireRole(caller, userId, ["admin"]);
}

/**
 * Token bucket en DB. Fail-closed (SEC-M4): si el RPC falla, se rechaza.
 * `check_and_record_rate_limit` sólo es ejecutable por service_role.
 */
export async function enforceRateLimit(
  admin: AdminClient,
  bucket: string,
  identifier: string,
  maxRequests = 10,
  windowSeconds = 60,
): Promise<void> {
  const { data, error } = await admin.rpc("check_and_record_rate_limit", {
    _bucket: bucket,
    _identifier: identifier,
    _max_requests: maxRequests,
    _window_seconds: windowSeconds,
  });

  if (error) {
    console.error(`[rateLimit:${bucket}] RPC error, fail-closed:`, error.message);
    throw new HttpError(
      503,
      "Servicio de control de acceso no disponible. Reintenta en unos segundos.",
    );
  }

  if (data === false) {
    throw new HttpError(
      429,
      `Demasiadas peticiones. Espera unos segundos antes de reintentar (límite ${maxRequests}/${windowSeconds}s).`,
    );
  }
}
