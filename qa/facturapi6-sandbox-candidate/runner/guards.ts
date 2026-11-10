// Restricciones del ejecutor alrededor del código intacto del snapshot.
// No modifican el snapshot: sólo envuelven sus dependencias inyectadas.
import { authenticateWithDeps } from "../snapshot/supabase/functions/_shared/authWithDeps.ts";
import { resolveCallerOrganization } from "../snapshot/supabase/functions/_shared/orgContext.ts";
import type { SupabaseLike } from "../snapshot/supabase/functions/_shared/types.ts";
import { type CallerClientLike, type Db, isRecord, type Query } from "./db.ts";
import { checkTenant } from "./policy.ts";

export interface IdentityDeps {
  createCallerClient: (authHeader: string) => CallerClientLike;
  createServiceClient: () => SupabaseLike;
}

export type IdentityResult =
  | { ok: true; userId: string; supabase: SupabaseLike }
  | { ok: false; status: number; code: string };

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fail = (status: number, code: string): IdentityResult => ({
  ok: false,
  status,
  code,
});

/**
 * Sesión real: `getClaims` debe traer `session_id` UUID y `auth.getUser(token)`
 * debe devolver el mismo usuario. Un token acuñado sin sesión (sin
 * `session_id`) o revocado falla con 401 antes de cualquier lectura de datos.
 */
async function verifySession(
  caller: CallerClientLike,
  token: string,
): Promise<
  { ok: true; sub: string } | { ok: false; status: number; code: string }
> {
  let claims: Record<string, unknown> | null = null;
  try {
    const r = await caller.auth.getClaims(token);
    if (!r.error && isRecord(r.data?.claims)) claims = r.data.claims;
  } catch {
    claims = null;
  }
  if (!claims) return { ok: false, status: 401, code: "unauthorized" };
  if (claims.role !== "authenticated") {
    return { ok: false, status: 403, code: "caller_role_not_allowed" };
  }
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!UUID_RE.test(sub)) {
    return { ok: false, status: 401, code: "unauthorized" };
  }
  const sessionId = typeof claims.session_id === "string"
    ? claims.session_id
    : "";
  if (!UUID_RE.test(sessionId)) {
    return { ok: false, status: 401, code: "session_required" };
  }
  try {
    const u = await caller.auth.getUser(token);
    const id = u.data?.user?.id;
    if (u.error || typeof id !== "string" || id !== sub) {
      return { ok: false, status: 401, code: "session_not_verified" };
    }
  } catch {
    return { ok: false, status: 401, code: "session_not_verified" };
  }
  return { ok: true, sub };
}

/**
 * Identidad estricta del caller humano. Fail-closed ante cualquier duda:
 * sesión no verificable, rol del JWT distinto de `authenticated`, perfil
 * ausente/erróneo/duplicado o `is_active !== true`, rol distinto de admin,
 * membresía interna ausente/múltiple/ajena u organización inactiva.
 */
export async function strictIdentity(
  req: Request,
  deps: IdentityDeps,
): Promise<IdentityResult> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ") || header.length <= 7) {
    return fail(401, "unauthorized");
  }
  const caller = deps.createCallerClient(header);
  const session = await verifySession(caller, header.slice(7));
  if (!session.ok) return fail(session.status, session.code);
  const sub = session.sub;

  let auth;
  try {
    auth = await authenticateWithDeps({
      req,
      createCallerClient: () => caller,
      createServiceClient: deps.createServiceClient,
      allowedRoles: ["admin"],
      logTag: "[fx6-sandbox]",
    });
  } catch {
    return fail(503, "auth_unavailable");
  }
  if (!auth.ok) return fail(auth.status, "unauthorized");
  if (auth.isServiceRole) return fail(403, "caller_role_not_allowed");
  if (auth.userId !== sub) return fail(401, "unauthorized");

  try {
    const db = auth.supabase as unknown as Db;
    const p = await db.from("profiles").select("is_active").eq("user_id", sub)
      .limit(2);
    if (p.error) return fail(503, "profile_unreadable");
    const rows = Array.isArray(p.data) ? p.data : [];
    if (rows.length !== 1 || !isRecord(rows[0]) || rows[0].is_active !== true) {
      return fail(403, "profile_not_active");
    }
  } catch {
    return fail(503, "profile_unreadable");
  }

  let org;
  try {
    org = await resolveCallerOrganization(auth.supabase as never, sub);
  } catch {
    return fail(503, "membership_check_failed");
  }
  if (!org.ok) return fail(org.status, "membership_check_failed");
  const t = checkTenant(org.organizationId);
  if (!t.ok) return fail(t.status, t.code);
  return { ok: true, userId: sub, supabase: auth.supabase };
}

const LIVE_COLUMN = "facturapi_live_key";

const wrappable = (v: unknown): v is Query =>
  typeof v === "object" && v !== null && !(v instanceof Promise);

function guardFilters(builder: Query): Query {
  return new Proxy(builder, {
    get(t, p, r) {
      const v: unknown = Reflect.get(t, p, r);
      if (typeof v !== "function" || p === "then") return v;
      return (...args: unknown[]) => {
        if (args.includes(LIVE_COLUMN)) {
          throw new Error("live_key_column_blocked");
        }
        const out: unknown = Reflect.apply(v, t, args);
        return wrappable(out) ? guardFilters(out) : out;
      };
    },
  });
}

/**
 * Vista del cliente de servicio para el código del snapshot: todo `select` de
 * `billing_secrets` que pida la columna live se reescribe a las demás columnas
 * y cualquier filtro por la columna live lanza. La llave live nunca viaja.
 */
export function restrictSecretsView<T extends Db>(admin: T): T {
  return new Proxy(admin, {
    get(target, prop, recv) {
      if (prop !== "from") return Reflect.get(target, prop, recv);
      return (table: string): Query => {
        const q = target.from(table);
        if (table !== "billing_secrets") return q;
        return new Proxy(q, {
          get(qt, qp, qr) {
            if (qp !== "select") return Reflect.get(qt, qp, qr);
            return (cols: string, ...rest: unknown[]) => {
              const safe = String(cols ?? "").split(",").map((c) => c.trim())
                .filter((c) => c !== "" && c !== LIVE_COLUMN);
              if (safe.length === 0) throw new Error("live_key_column_blocked");
              return guardFilters(qt.select(safe.join(", "), ...rest));
            };
          },
        });
      };
    },
  });
}

/** Entorno visible al snapshot: nunca expone llaves Facturapi por variable. */
export function restrictEnv(env: (k: string) => string | undefined) {
  return (k: string) => (/FACTURAPI/i.test(k) ? undefined : env(k));
}
