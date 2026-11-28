import type { SupabaseLike } from "../_shared/types.ts";

export interface StampPaymentComplementDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (k: string) => string | undefined;
}

/**
 * Réplica exacta (sólo con clientes inyectados) de `requireRole` en
 * `_shared/auth.ts`: valida el JWT del caller y exige uno de `roles` en
 * `user_roles`. Sin bypass de service_role.
 */
export async function requireRoleDI(
  req: Request,
  deps: StampPaymentComplementDeps,
  roles: string[],
): Promise<
  | { ok: true; userId: string; supabase: SupabaseLike }
  | { ok: false; status: number; message: string }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const token = authHeader.replace("Bearer ", "");
  const callerClient = deps.createCallerClient(authHeader);
  const { data, error } = await callerClient.auth.getClaims(token);
  if (error || !data?.claims) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const userId = (data.claims as { sub?: string }).sub as string;
  if (!userId) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const supabase = deps.createServiceClient();

  const profileRes = await supabase
    .from("profiles")
    .select("is_active")
    .eq("user_id", userId)
    .maybeSingle();
  const profileErr = (profileRes as { error: unknown }).error;
  if (profileErr) {
    console.error(
      "[auth] profiles lookup failed, fail-closed:",
      profileErr instanceof Error ? profileErr.message : String(profileErr),
    );
    return {
      ok: false,
      status: 503,
      message:
        "Servicio de verificación de cuenta no disponible. Reintenta en unos segundos.",
    };
  }
  const profile = (profileRes as { data: unknown }).data as
    | { is_active: boolean | null }
    | null;
  if (profile && profile.is_active === false) {
    return { ok: false, status: 403, message: "Cuenta desactivada" };
  }

  const roleRes = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles)
    .maybeSingle();
  const roleData = (roleRes as { data: unknown }).data as
    | { role: string }
    | null;
  if (!roleData) {
    return { ok: false, status: 403, message: "Forbidden: insufficient role" };
  }

  return { ok: true, userId, supabase };
}
