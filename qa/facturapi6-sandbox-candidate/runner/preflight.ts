// Fase 0: lectura previa. Ejecuta código auténtico del PR #438 (snapshot):
// autenticación, empresa del usuario y resolución de llave por empresa.
// La única llamada al proveedor es GET /v2/organizations/me (SDK 6
// `organizations.me()`), de solo lectura. Nunca devuelve ni registra la llave.
import { authenticateWithDeps } from "../snapshot/supabase/functions/_shared/authWithDeps.ts";
import { resolveCallerOrganization } from "../snapshot/supabase/functions/_shared/orgContext.ts";
import {
  createFacturapiClient,
  getFacturapiConfigForOrganization,
  isFacturapiConfigError,
} from "../snapshot/supabase/functions/_shared/facturapi/client.ts";
import type { SupabaseLike } from "../snapshot/supabase/functions/_shared/types.ts";
import {
  checkActionEnabled,
  checkExpiry,
  checkTenant,
  checkTestKey,
  compareIssuer,
  parseAction,
  PROVIDER_TIMEOUT_MS,
  RUN_ID,
  TENANT_ORGANIZATION_ID,
} from "./policy.ts";

export interface IssuerReader {
  me(signal: AbortSignal): Promise<unknown>;
}

export interface RunnerDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  env: (k: string) => string | undefined;
  now: () => number;
  /** Por defecto usa el SDK 6 del snapshot. Inyectable para pruebas sin red. */
  createIssuerReader?: (apiKey: string) => IssuerReader;
}

/** Exclusión dentro del isolate. No cubre isolates distintos (ver README). */
let inFlight = false;
export function __resetInFlightForTests() {
  inFlight = false;
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ run_id: RUN_ID, ...body }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function sdkIssuerReader(apiKey: string): IssuerReader {
  const client = createFacturapiClient(apiKey);
  return {
    me: (signal) => {
      // organizations.me() del SDK 6 no recibe signal; se acota con la misma
      // técnica del adapter revisado: vista aislada del transporte.
      const orgs = client.organizations;
      const transport = orgs?.client;
      if (typeof orgs?.me !== "function" || typeof transport?.request !== "function") {
        throw new Error("sdk6_organizations_me_unavailable");
      }
      const scopedTransport = Object.create(transport);
      scopedTransport.request = (p: string, o: Record<string, unknown> = {}) =>
        transport.request(p, { ...o, signal });
      const scoped = Object.create(orgs);
      scoped.client = scopedTransport;
      return scoped.me();
    },
  };
}

export async function handleRunner(req: Request, deps: RunnerDeps): Promise<Response> {
  const expiry = checkExpiry(deps.now());
  if (!expiry.ok) return reply(expiry.status, { error: expiry.code });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "invalid_body" });
  }
  const action = parseAction(body);
  if (!action) return reply(400, { error: "invalid_action" });
  const enabled = checkActionEnabled(action);
  if (!enabled.ok) return reply(enabled.status, { error: enabled.code });

  // Usuario real: JWT válido, cuenta activa y rol admin (código del PR).
  const auth = await authenticateWithDeps({
    req,
    createCallerClient: (h) => deps.createCallerClient(h) as never,
    createServiceClient: deps.createServiceClient,
    allowedRoles: ["admin"],
    logTag: "[fx6-sandbox]",
  });
  if (!auth.ok) return reply(auth.status, { error: "unauthorized" });
  if (auth.isServiceRole) return reply(403, { error: "service_role_not_allowed" });

  const org = await resolveCallerOrganization(auth.supabase as never, auth.userId);
  if (!org.ok) return reply(org.status, { error: "membership_check_failed" });
  const tenant = checkTenant(org.organizationId);
  if (!tenant.ok) return reply(tenant.status, { error: tenant.code });

  if (inFlight) return reply(409, { error: "run_in_progress" });
  inFlight = true;
  try {
    const { data: co, error: coErr } = await (auth.supabase as any)
      .from("company_settings")
      .select("facturapi_mode, razon_social, rfc")
      .eq("organization_id", TENANT_ORGANIZATION_ID)
      .limit(2);
    if (coErr) return reply(503, { error: "company_settings_unreadable" });
    if (!Array.isArray(co) || co.length !== 1) {
      return reply(409, { error: "company_settings_ambiguous" });
    }

    let cfg;
    try {
      cfg = await getFacturapiConfigForOrganization({
        admin: auth.supabase as never,
        env: deps.env,
        organizationId: TENANT_ORGANIZATION_ID,
        modeOverride: co[0].facturapi_mode ?? null,
      });
    } catch (e) {
      return reply(409, {
        error: isFacturapiConfigError(e) ? e.code : "config_error",
      });
    }
    const key = checkTestKey(cfg.mode, cfg.apiKey, cfg.fromEnvFallback);
    if (!key.ok) return reply(key.status, { error: key.code });

    const reader = (deps.createIssuerReader ?? sdkIssuerReader)(cfg.apiKey!);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PROVIDER_TIMEOUT_MS);
    let me: any;
    try {
      me = await reader.me(ac.signal);
    } catch {
      // Lectura: no hay efecto fiscal que reconciliar; se detiene sin reintento.
      return reply(502, {
        error: ac.signal.aborted ? "issuer_read_timeout" : "issuer_read_failed",
      });
    } finally {
      clearTimeout(timer);
    }
    const cmp = compareIssuer({
      providerLegalName: me?.legal?.legal_name,
      providerTaxId: me?.legal?.tax_id,
      erpRazonSocial: co[0].razon_social,
      erpRfc: co[0].rfc,
    });
    const ok = cmp.legalNameMatches && cmp.taxIdMatches;
    return reply(ok ? 200 : 409, {
      action,
      preflight_ok: ok,
      tenant_matches: true,
      mode_is_test: true,
      key_is_test_and_exclusive: true,
      issuer_legal_name_matches: cmp.legalNameMatches,
      issuer_tax_id_matches: cmp.taxIdMatches,
      provider_writes: 0,
      erp_writes: 0,
    });
  } finally {
    inFlight = false;
  }
}
