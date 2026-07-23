// Helper de autenticación reutilizable para handlers con dependency-injection
// (stamp-cfdi, stamp-credit-note, cancel-cfdi, cancel-payment-complement,
// refresh-cancellation-status, validate-receptor-tax-info). Deduplica ~25 LOC
// que se repetían en cada handler y mantiene el mismo contrato: bypass para
// service_role JWT (consumer de cfdi_retry_queue) y validación de rol para
// usuarios finales.
import type { SupabaseLike } from "./types.ts";

export interface CallerClaims {
  claims?: Record<string, unknown> | null;
}

export interface CallerAuth {
  getClaims: (
    token: string,
  ) => Promise<{ data: CallerClaims | null; error: unknown }>;
}

export type CallerLike = {
  auth: CallerAuth;
};

export interface AuthWithDepsOk {
  ok: true;
  userId: string;
  isServiceRole: boolean;
  supabase: SupabaseLike;
}

export interface AuthWithDepsFail {
  ok: false;
  status: number;
  message: string;
}

export type AuthWithDepsResult = AuthWithDepsOk | AuthWithDepsFail;

export interface AuthWithDepsInput {
  req: Request;
  createCallerClient: (authHeader: string) => CallerLike;
  createServiceClient: () => SupabaseLike;
  allowedRoles: readonly string[];
  /** Prefijo para logs (ej. "[stamp-cfdi]"). */
  logTag?: string;
}

/**
 * Valida el JWT del caller (getClaims) y su rol contra `user_roles`.
 * Devuelve tanto el `supabase` service-role client como `userId` y flag
 * `isServiceRole` para que el handler no tenga que reconstruirlos.
 */
export async function authenticateWithDeps(
  input: AuthWithDepsInput,
): Promise<AuthWithDepsResult> {
  const { req, createCallerClient, createServiceClient, allowedRoles, logTag } =
    input;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const token = authHeader.replace("Bearer ", "");

  const callerClient = createCallerClient(authHeader);
  const { data: claimsData, error: claimsErr } = await callerClient.auth
    .getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    if (logTag) console.error(`${logTag} getClaims failed`);
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const claims = claimsData.claims as Record<string, unknown>;
  const isServiceRole = claims.role === "service_role";
  const userId = (claims.sub as string | undefined) ?? "";

  const supabase = createServiceClient();

  if (!isServiceRole) {
    if (!userId) {
      return { ok: false, status: 401, message: "Unauthorized" };
    }
    const rolesRes = await supabase.from("user_roles").select("role").eq(
      "user_id",
      userId,
    );
    const rolesErr = (rolesRes as { error: unknown }).error;
    if (rolesErr) {
      if (logTag) console.error(`${logTag} roles lookup failed`, { userId });
      return {
        ok: false,
        status: 500,
        message: "Authorization check failed",
      };
    }
    const roles = (rolesRes as { data: unknown }).data as
      | Array<{ role: string }>
      | null;
    const allowed = (roles ?? []).some((r) =>
      (allowedRoles as readonly string[]).includes(r.role)
    );
    if (!allowed) {
      if (logTag) console.error(`${logTag} forbidden`, { userId });
      return { ok: false, status: 403, message: "Forbidden" };
    }
  }

  return { ok: true, userId, isServiceRole, supabase };
}
