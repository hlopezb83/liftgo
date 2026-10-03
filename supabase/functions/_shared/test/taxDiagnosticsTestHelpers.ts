import type { CallerLike } from "../authWithDeps.ts";
import type {
  EdgeDiagnostics,
  VerifiedEdgeIdentity,
} from "../edgeDiagnostics.ts";
import { buildSupabaseMock } from "./supabaseClientMock.ts";

export const ACTOR = "10000000-0000-4000-8000-000000000001";
export const ORG_A = "20000000-0000-4000-8000-000000000001";
export const ORG_B = "20000000-0000-4000-8000-000000000002";
export const INVOICE = "30000000-0000-4000-8000-000000000001";
const CUSTOMER = "40000000-0000-4000-8000-000000000001";

export function taxDiagnosticsFixture(
  invoiceOrganization = ORG_A,
  options: { saveError?: unknown } = {},
) {
  const identities: VerifiedEdgeIdentity[] = [];
  const captures: { error: unknown; status?: number }[] = [];
  const diagnostics: EdgeDiagnostics = {
    identify: (identity) => identities.push(identity),
    capture: (error, status) => captures.push({ error, status }),
  };
  const state = buildSupabaseMock({
    selects: {
      profiles: { data: { is_active: true }, error: null },
      user_roles: { data: [{ role: "administrativo" }], error: null },
      organization_memberships: {
        data: [{ organization_id: ORG_A }],
        error: null,
      },
      invoices: {
        data: {
          organization_id: invoiceOrganization,
          receptor_rfc: "AAA010101AAA",
          receptor_razon_social: "COMERCIAL DEL NORTE",
          receptor_regimen_fiscal: "601",
          receptor_domicilio_fiscal_cp: "64000",
        },
        error: null,
      },
      company_settings: { data: { facturapi_mode: "test" }, error: null },
      billing_secrets: {
        data: { facturapi_test_key: "sk_test_synthetic_only" },
        error: null,
      },
      organization_customers: {
        data: [{
          customer_id: CUSTOMER,
          alias: "Comercial del Norte",
          customers: { name: "Comercial del Norte" },
          razon_social: "COMERCIAL DEL NORTE",
          rfc: "AAA010101AAA",
          regimen_fiscal: "601",
          domicilio_fiscal_cp: "64000",
          sat_validation_status: "not_validated",
          sat_validated_at: null,
          updated_at: "2026-09-26T12:00:00Z",
        }],
        error: null,
      },
    },
    updates: {
      organization_customers: {
        data: [{ customer_id: CUSTOMER }],
        error: options.saveError ?? null,
      },
    },
  });
  const queries: string[] = [];
  const service = {
    ...state.client,
    from: (table: string) => {
      queries.push(table);
      return state.client.from(table);
    },
  };
  const caller: CallerLike = {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: {
            claims: {
              sub: ACTOR,
              role: "authenticated",
              email: "private@example.invalid",
              organization_id: ORG_B,
            },
          },
          error: null,
        }),
    },
  };
  let fetchCalls = 0;
  const deps = {
    createCallerClient: () => caller,
    createServiceClient: () => service,
    env: () => undefined,
    sleep: () => Promise.resolve(),
    fetchImpl: (() => {
      fetchCalls++;
      return Promise.resolve(new Response('{"is_valid":true}'));
    }) as typeof fetch,
  };
  return {
    deps,
    state,
    queries,
    identities,
    captures,
    diagnostics,
    fetchCalls: () => fetchCalls,
  };
}

export function taxRequest(body: Record<string, unknown> = {}) {
  return new Request("https://example.invalid/validate", {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, organization_id: ORG_B }),
  });
}
