// Fase 0: lectura previa. Ejecuta código auténtico del PR #438 (snapshot):
// autenticación, empresa del usuario y resolución de llave por empresa.
// La única llamada al proveedor es GET /v2/organizations/me (SDK 6
// `organizations.me()`), de solo lectura. Nunca devuelve ni registra la llave.
import {
  createFacturapiClient,
  getFacturapiConfigForOrganization,
  isFacturapiConfigError,
} from "../snapshot/supabase/functions/_shared/facturapi/client.ts";
import type { SupabaseLike } from "../snapshot/supabase/functions/_shared/types.ts";
import { type CallerClientLike, type Db, isRecord } from "./db.ts";
import { restrictEnv, restrictSecretsView, strictIdentity } from "./guards.ts";
import {
  checkActionEnabled,
  checkExpiry,
  checkTestKey,
  compareIssuer,
  parseAction,
  providerDeadlineMs,
  RUN_ID,
  TENANT_ORGANIZATION_ID,
} from "./policy.ts";

export interface IssuerReader {
  me(signal: AbortSignal): Promise<unknown>;
}

export interface RunnerDeps {
  createCallerClient: (authHeader: string) => CallerClientLike;
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
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

interface ScopedTransport {
  request: (path: string, opts?: Record<string, unknown>) => Promise<unknown>;
}
interface OrganizationsResource {
  me?: () => Promise<unknown>;
  client?: ScopedTransport;
}

function sdkIssuerReader(apiKey: string): IssuerReader {
  const client = createFacturapiClient(apiKey);
  return {
    me: (signal) => {
      // organizations.me() del SDK 6 no recibe signal; se acota con la misma
      // técnica del adapter revisado: vista aislada del transporte.
      const orgs = client.organizations as unknown as OrganizationsResource;
      const transport = orgs?.client;
      if (
        typeof orgs?.me !== "function" ||
        typeof transport?.request !== "function"
      ) {
        throw new Error("sdk6_organizations_me_unavailable");
      }
      const scopedTransport: ScopedTransport = Object.create(transport);
      scopedTransport.request = (p, o = {}) =>
        transport.request(p, { ...o, signal });
      const scoped: OrganizationsResource = Object.create(orgs);
      scoped.client = scopedTransport;
      return orgs.me.call(scoped);
    },
  };
}

const legalOf = (me: unknown) => {
  const legal = isRecord(me) && isRecord(me.legal) ? me.legal : {};
  return { legalName: legal.legal_name, taxId: legal.tax_id };
};

export async function handleRunner(
  req: Request,
  deps: RunnerDeps,
): Promise<Response> {
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

  // Sesión real + identidad estricta (wrapper sobre el código del PR).
  const id = await strictIdentity(req, {
    createCallerClient: deps.createCallerClient,
    createServiceClient: deps.createServiceClient,
  });
  if (!id.ok) return reply(id.status, { error: id.code });
  const db = id.supabase as unknown as Db;

  if (inFlight) return reply(409, { error: "run_in_progress" });
  inFlight = true;
  try {
    const { data: co, error: coErr } = await db
      .from("company_settings")
      .select("facturapi_mode, razon_social, rfc")
      .eq("organization_id", TENANT_ORGANIZATION_ID)
      .limit(2);
    if (coErr) return reply(503, { error: "company_settings_unreadable" });
    if (!Array.isArray(co) || co.length !== 1 || !isRecord(co[0])) {
      return reply(409, { error: "company_settings_ambiguous" });
    }
    const settings = co[0];
    // Modo explícito ANTES de resolver credenciales: live se rechaza sin
    // tocar billing_secrets.
    if (settings.facturapi_mode !== "test") {
      return reply(409, { error: "mode_not_test" });
    }

    let cfg;
    try {
      cfg = await getFacturapiConfigForOrganization({
        admin: restrictSecretsView(db),
        env: restrictEnv(deps.env),
        organizationId: TENANT_ORGANIZATION_ID,
        modeOverride: "test",
      });
    } catch (e) {
      // Sólo el código de error; nunca mensaje ni valores.
      return reply(409, {
        error: isFacturapiConfigError(e) ? e.code : "config_error",
      });
    }
    const key = checkTestKey(cfg.mode, cfg.apiKey, cfg.fromEnvFallback);
    const apiKey = cfg.apiKey;
    if (!key.ok) return reply(key.status, { error: key.code });
    if (typeof apiKey !== "string") {
      return reply(409, { error: "key_not_test" });
    }

    // Revalidar ventana justo antes del proveedor; el tiempo límite es el
    // menor entre 15 s y lo que resta. Sin margen, no se envía.
    const deadline = providerDeadlineMs(deps.now());
    if (deadline <= 0) return reply(410, { error: "run_expired" });
    const reader = (deps.createIssuerReader ?? sdkIssuerReader)(apiKey);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), deadline);
    let me: unknown;
    try {
      if (ac.signal.aborted) return reply(410, { error: "run_expired" });
      me = await reader.me(ac.signal);
    } catch {
      // Lectura: no hay efecto fiscal que reconciliar; se detiene sin reintento.
      return reply(502, {
        error: ac.signal.aborted ? "issuer_read_timeout" : "issuer_read_failed",
      });
    } finally {
      clearTimeout(timer);
    }
    const legal = legalOf(me);
    const cmp = compareIssuer({
      providerLegalName: legal.legalName,
      providerTaxId: legal.taxId,
      erpRazonSocial: settings.razon_social,
      erpRfc: settings.rfc,
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
