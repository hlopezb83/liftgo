/**
 * Autorización por rol del caller autenticado (server-only).
 *
 * El rol se decide con el cliente del propio usuario (`has_role`,
 * SECURITY DEFINER), nunca con el cliente privilegiado; éste se carga sólo
 * después de aprobar el guard. Fail-closed ante cualquier error de lectura.
 */
import {
  type AdminClient,
  type AppRole,
  type AuthorizedCaller,
  type CallerClient,
  HttpError,
} from "./httpError";

/** Exige que el caller autenticado esté activo y tenga uno de los roles. */
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
