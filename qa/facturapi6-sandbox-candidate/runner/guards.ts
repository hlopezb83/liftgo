// Restricciones del ejecutor alrededor del código intacto del snapshot.
// No modifican el snapshot: sólo envuelven sus dependencias inyectadas.
import { authenticateWithDeps } from "../snapshot/supabase/functions/_shared/authWithDeps.ts";
import { resolveCallerOrganization } from "../snapshot/supabase/functions/_shared/orgContext.ts";
import type { SupabaseLike } from "../snapshot/supabase/functions/_shared/types.ts";
import { checkTenant, type Gate, TENANT_ORGANIZATION_ID } from "./policy.ts";

export interface CallerClientLike {
  auth: {
    getClaims: (t: string) => Promise<{ data: { claims?: Record<string, unknown> | null } | null; error: unknown }>;
  };
}

export interface IdentityDeps {
  createCallerClient: (authHeader: string) => CallerClientLike;
  createServiceClient: () => SupabaseLike;
}

export type IdentityResult =
  | { ok: true; userId: string; supabase: SupabaseLike }
  | { ok: false; status: number; code: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Identidad estricta del caller humano. Fail-closed ante cualquier duda:
 * - token ausente / getClaims con error;
 * - rol del JWT distinto de `authenticated` (rechaza service_role, anon, cron);
 * - `sub` vacío o no UUID;
 * - perfil ausente, error de lectura o `is_active !== true` (null también falla,
 *   a diferencia de `authenticateWithDeps`, que sólo rechaza `false`);
 * - rol distinto de admin (vía snapshot);
 * - membresía interna ausente/múltiple/ajena u organización inactiva (vía snapshot).
 */
export async function strictIdentity(req: Request, deps: IdentityDeps): Promise<IdentityResult> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ") || header.length <= 7) {
    return { ok: false, status: 401, code: "unauthorized" };
  }
  let claims: Record<string, unknown> | null = null;
  try {
    const r = await deps.createCallerClient(header).auth.getClaims(header.slice(7));
    if (!r.error) claims = r.data?.claims ?? null;
  } catch {
    claims = null;
  }
  if (!claims) return { ok: false, status: 401, code: "unauthorized" };
  if (claims.role !== "authenticated") {
    return { ok: false, status: 403, code: "caller_role_not_allowed" };
  }
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!UUID_RE.test(sub)) return { ok: false, status: 401, code: "unauthorized" };

  let auth;
  try {
    auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h) as never,
      createServiceClient: deps.createServiceClient,
      allowedRoles: ["admin"],
      logTag: "[fx6-sandbox]",
    });
  } catch {
    return { ok: false, status: 503, code: "auth_unavailable" };
  }
  if (!auth.ok) return { ok: false, status: auth.status, code: "unauthorized" };
  if (auth.isServiceRole) return { ok: false, status: 403, code: "caller_role_not_allowed" };
  if (auth.userId !== sub) return { ok: false, status: 401, code: "unauthorized" };

  try {
    const p = await (auth.supabase as any).from("profiles").select("is_active")
      .eq("user_id", sub).limit(2);
    if (p?.error) return { ok: false, status: 503, code: "profile_unreadable" };
    if (!Array.isArray(p?.data) || p.data.length !== 1 || p.data[0]?.is_active !== true) {
      return { ok: false, status: 403, code: "profile_not_active" };
    }
  } catch {
    return { ok: false, status: 503, code: "profile_unreadable" };
  }

  let org;
  try {
    org = await resolveCallerOrganization(auth.supabase as never, sub);
  } catch {
    return { ok: false, status: 503, code: "membership_check_failed" };
  }
  if (!org.ok) return { ok: false, status: org.status, code: "membership_check_failed" };
  const t: Gate = checkTenant(org.organizationId);
  if (!t.ok) return { ok: false, status: t.status, code: t.code };
  return { ok: true, userId: sub, supabase: auth.supabase };
}

const LIVE_COLUMN = "facturapi_live_key";

/**
 * Vista del cliente de servicio para el código del snapshot:
 * - `billing_secrets`: cualquier `select` que pida la columna live se reescribe
 *   para pedir sólo `facturapi_test_key`; la llave live nunca viaja al isolate.
 *   Filtros sobre la columna live se rechazan (lanzan) para fallar cerrado.
 * - `billing_secrets` sólo se lee del tenant fijo o para la verificación de
 *   exclusividad que hace el propio snapshot.
 * Todo lo demás pasa sin cambios.
 */
export function restrictSecretsView<T extends { from: (t: string) => any }>(admin: T): T {
  return new Proxy(admin, {
    get(target, prop, recv) {
      if (prop !== "from") return Reflect.get(target, prop, recv);
      return (table: string) => {
        const q = target.from(table);
        if (table !== "billing_secrets") return q;
        return new Proxy(q, {
          get(qt, qp, qr) {
            if (qp !== "select") return Reflect.get(qt, qp, qr);
            return (cols: string, ...rest: unknown[]) => {
              const list = String(cols ?? "").split(",").map((c) => c.trim()).filter(Boolean);
              const safe = list.filter((c) => c !== LIVE_COLUMN);
              if (safe.length === 0) throw new Error("live_key_column_blocked");
              return guardFilters(qt.select(safe.join(", "), ...rest));
            };
          },
        });
      };
    },
  });
}

function guardFilters(builder: any): any {
  return new Proxy(builder, {
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (typeof v !== "function" || p === "then") return v;
      return (...args: unknown[]) => {
        if (args[0] === LIVE_COLUMN) throw new Error("live_key_column_blocked");
        const out = v.apply(t, args);
        return out && typeof out === "object" && out !== t ? guardFilters(out) : out === t ? guardFilters(t) : out;
      };
    },
  });
}

/** Entorno visible al snapshot: nunca expone llaves Facturapi por variable. */
export function restrictEnv(env: (k: string) => string | undefined) {
  return (k: string) => (/FACTURAPI/i.test(k) ? undefined : env(k));
}

export const SECRET_COLUMNS_REQUESTED_FOR_TENANT = TENANT_ORGANIZATION_ID;
