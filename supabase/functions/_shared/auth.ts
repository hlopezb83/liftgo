// Helpers compartidos de autenticación / autorización para Edge Functions admin.
// Centralizan validación de JWT, lookup de rol y generación de contraseñas seguras.
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "./cors.ts";
import { jsonError } from "./http.ts";
import { getAdminClient, getCallerClient } from "./supabaseClients.ts";

// Re-export para retro-compatibilidad con call sites existentes.
export { jsonError } from "./http.ts";

export type AuthSuccess = {
  ok: true;
  userId: string;
  email: string | null;
  role: string | null;
  adminClient: SupabaseClient;
};

export type AuthFailure = {
  ok: false;
  response: Response;
};

export type AuthResult = AuthSuccess | AuthFailure;

/** Valida el JWT del caller. Devuelve userId + adminClient (service role). */
export async function requireAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, response: jsonError(req, 401, "Unauthorized") };
  }

  const callerClient = getCallerClient(req);
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await callerClient.auth.getClaims(token);
  if (error || !data?.claims) {
    return { ok: false, response: jsonError(req, 401, "Unauthorized") };
  }

  const adminClient = getAdminClient();
  const userId = data.claims.sub as string;
  const email = (data.claims.email as string | undefined) ?? null;

  // SEC-M2: un JWT emitido sigue siendo válido aunque el usuario haya sido
  // desactivado (getClaims no consulta la DB). Verificar is_active en cada
  // llamada cierra la ventana de acceso (~1h) de usuarios dados de baja.
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("is_active")
    .eq("user_id", userId)
    .maybeSingle();
  // SEC-M2 (R2 Bajo 3): fail-closed. Si la consulta a profiles falla no podemos
  // saber si la cuenta sigue activa; denegar (mismo criterio que el rate limiter,
  // SEC-M4) en vez de dejar pasar a un usuario potencialmente desactivado.
  if (profileError) {
    console.error("[auth] profiles lookup failed, fail-closed:", profileError.message);
    return {
      ok: false,
      response: jsonError(req, 503, "Servicio de verificación de cuenta no disponible. Reintenta en unos segundos."),
    };
  }
  if (profile && profile.is_active === false) {
    return { ok: false, response: jsonError(req, 403, "Cuenta desactivada") };
  }

  return { ok: true, userId, email, role: null, adminClient };
}

/** Valida el JWT y exige que el caller tenga uno de los roles indicados. */
export async function requireRole(
  req: Request,
  roles: string[],
): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  const { data: roleData } = await auth.adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId)
    .in("role", roles)
    .maybeSingle();

  if (!roleData) {
    return {
      ok: false,
      response: jsonError(req, 403, "Forbidden: insufficient role"),
    };
  }

  return { ...auth, role: roleData.role as string };
}

/** Atajo: exige rol admin. */
export function requireAdmin(req: Request): Promise<AuthResult> {
  return requireRole(req, ["admin"]);
}

/**
 * EC-A1: igual que requireRole pero con bypass para el consumidor interno de
 * la cola de reintentos CFDI (mismo patrón que stamp-cfdi/handler.ts): un
 * service_role JWT del backend no necesita rol en user_roles. Cualquier otro
 * token sigue el flujo normal (JWT válido + rol requerido).
 */
export async function requireServiceOrRole(
  req: Request,
  roles: string[],
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, response: jsonError(req, 401, "Unauthorized") };
  }

  const callerClient = getCallerClient(req);
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await callerClient.auth.getClaims(token);
  if (error || !data?.claims) {
    return { ok: false, response: jsonError(req, 401, "Unauthorized") };
  }

  const adminClient = getAdminClient();
  const claims = data.claims as Record<string, unknown>;
  const userId = (claims.sub as string | undefined) ?? "";
  const email = (claims.email as string | undefined) ?? null;

  // Bypass service_role (backend interno: process-cfdi-retry-queue).
  if (claims.role === "service_role") {
    return { ok: true, userId, email, role: "service_role", adminClient };
  }
  if (!userId) {
    return { ok: false, response: jsonError(req, 401, "Unauthorized") };
  }

  // SEC-M2: mismo guard de cuenta desactivada en la ruta con rol explícito
  // (el bypass service_role de arriba queda intacto: no tiene profile).
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("is_active")
    .eq("user_id", userId)
    .maybeSingle();
  // SEC-M2 (R2 Bajo 3): fail-closed. Si la consulta a profiles falla no podemos
  // saber si la cuenta sigue activa; denegar (mismo criterio que el rate limiter,
  // SEC-M4) en vez de dejar pasar a un usuario potencialmente desactivado.
  if (profileError) {
    console.error("[auth] profiles lookup failed, fail-closed:", profileError.message);
    return {
      ok: false,
      response: jsonError(req, 503, "Servicio de verificación de cuenta no disponible. Reintenta en unos segundos."),
    };
  }
  if (profile && profile.is_active === false) {
    return { ok: false, response: jsonError(req, 403, "Cuenta desactivada") };
  }

  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles)
    .maybeSingle();

  if (!roleData) {
    return {
      ok: false,
      response: jsonError(req, 403, "Forbidden: insufficient role"),
    };
  }

  return {
    ok: true,
    userId,
    email,
    role: roleData.role as string,
    adminClient,
  };
}

/**
 * Genera una contraseña segura usando rejection sampling para evitar el bias
 * que introduce `% charset.length` cuando 256 no es múltiplo del tamaño del charset.
 */
export function generateSecurePassword(length = 20): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const max = Math.floor(256 / charset.length) * charset.length;
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) out.push(charset[buf[0] % charset.length]);
  }
  return out.join("");
}

/**
 * Aplica rate limiting (token bucket simple en DB) para una Edge Function admin.
 * Devuelve null si el caller está dentro del límite, o un Response 429 si lo excedió.
 *
 * @param bucket nombre lógico (ej: "invite-user")
 * @param identifier por convención el userId del caller
 * @param maxRequests máximo permitido por ventana
 * @param windowSeconds tamaño de la ventana en segundos
 */
export async function enforceRateLimit(
  req: Request,
  adminClient: SupabaseClient,
  bucket: string,
  identifier: string,
  maxRequests = 10,
  windowSeconds = 60,
): Promise<Response | null> {
  const { data, error } = await adminClient.rpc("check_and_record_rate_limit", {
    _bucket: bucket,
    _identifier: identifier,
    _max_requests: maxRequests,
    _window_seconds: windowSeconds,
  });

  // SEC-M4: fail-closed. Si el RPC del rate limiter falla, rechazamos con 503
  // en vez de continuar sin límite: un fallo (natural o inducido) no debe
  // dejar funciones sensibles (reset-user-password, invite-user) sin freno.
  if (error) {
    console.error(
      `[rateLimit:${bucket}] RPC error, fail-closed:`,
      error.message,
    );
    return new Response(
      JSON.stringify({
        error:
          "Servicio de control de acceso no disponible. Reintenta en unos segundos.",
      }),
      {
        status: 503,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      },
    );
  }

  if (data === false) {
    return new Response(
      JSON.stringify({
        error:
          `Demasiadas peticiones. Espera unos segundos antes de reintentar (límite ${maxRequests}/${windowSeconds}s).`,
      }),
      {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
          "Retry-After": String(windowSeconds),
        },
      },
    );
  }

  return null;
}
