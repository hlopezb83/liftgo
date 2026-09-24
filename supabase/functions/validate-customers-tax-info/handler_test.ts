// Cobertura de la validación masiva de la cartera contra el SAT.
// Verifica: rol requerido, guardado del resultado por cliente, detección de
// datos faltantes sin pegarle al PAC, manejo de error del PAC y aislamiento
// fiscal multiempresa: la corrida sólo toca relaciones/credenciales
// de la empresa del caller.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleValidateCustomers } from "./handler.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { CallerLike } from "../_shared/authWithDeps.ts";

const AUTH_HDR = {
  Authorization: "Bearer t",
  "Content-Type": "application/json",
};

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeCaller(
  claims: Record<string, unknown> = { role: "authenticated", sub: "u-1" },
): CallerLike {
  return {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: { claims },
          error: null,
        }),
    },
  };
}

interface MakeServiceOpts {
  role?: string;
  membershipOrgId?: string | null;
  organizationCustomers?: unknown[];
  customers?: unknown[];
  billingSecrets?: Record<string, unknown> | null;
  organizationsCount?: Array<{ id: string }>;
  saveRows?: unknown[];
}

function makeService(opts: MakeServiceOpts) {
  const membershipOrgId = opts.membershipOrgId === undefined
    ? ORG_A
    : opts.membershipOrgId;
  return buildSupabaseMock({
    selects: {
      user_roles: { data: [{ role: opts.role ?? "admin" }], error: null },
      profiles: { data: { is_active: true }, error: null },
      organization_memberships: membershipOrgId
        ? { data: [{ organization_id: membershipOrgId }], error: null }
        : { data: [], error: null },
      organization_customers: {
        data: opts.organizationCustomers ?? [],
        error: null,
      },
      customers: { data: opts.customers ?? [], error: null },
      company_settings: { data: { facturapi_mode: "test" }, error: null },
      billing_secrets: opts.billingSecrets === undefined
        ? {
          data: { facturapi_test_key: "sk_test_x", facturapi_live_key: null },
          error: null,
        }
        : { data: opts.billingSecrets, error: null },
      organizations: {
        data: opts.organizationsCount ?? [{ id: ORG_A }],
        error: null,
      },
    },
    updates: {
      organization_customers: {
        data: opts.saveRows ?? [{ customer_id: CUSTOMER_A_ID }],
        error: null,
      },
    },
  });
}

function req(body: unknown = {}) {
  return new Request("http://localhost/validate-customers", {
    method: "POST",
    headers: AUTH_HDR,
    body: JSON.stringify(body),
  });
}

const CUSTOMER_A_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_B_ID = "22222222-2222-2222-2222-222222222222";

const ORG_A_LINK = {
  customer_id: CUSTOMER_A_ID,
  alias: "ACME",
  customers: { name: "ACME" },
  razon_social: "ACME SA DE CV",
  rfc: "AAA010101AAA",
  regimen_fiscal: "601",
  domicilio_fiscal_cp: "64000",
  sat_validation_status: "not_validated",
  sat_validated_at: null,
  updated_at: "2026-09-23T00:00:00Z",
};

function deps(
  state: ReturnType<typeof makeService>,
  fetchImpl: typeof fetch,
  callerClaims?: Record<string, unknown>,
) {
  return {
    createCallerClient: () => makeCaller(callerClaims),
    createServiceClient: () => state.client as SupabaseLike,
    fetchImpl,
    env: (_k: string) => undefined,
    sleep: () => Promise.resolve(),
  };
}

Deno.test("validate-customers: sin Authorization → 401", async () => {
  const state = makeService({});
  const res = await handleValidateCustomers(
    new Request("http://localhost/validate-customers", { method: "POST" }),
    deps(state, fetch),
  );
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("validate-customers: cliente válido según el PAC → status valid", async () => {
  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ is_valid: true }), { status: 200 }),
    )) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.processed, 1);
  assertEquals(body.valid, 1);
  const upd = state.updates.find((u) => u.table === "organization_customers");
  assertEquals(upd?.patch.sat_validation_status, "valid");
  assertEquals(upd?.filters.find((f) => f.col === "organization_id")?.val, ORG_A);
  assertEquals(upd?.filters.find((f) => f.col === "updated_at")?.val, ORG_A_LINK.updated_at);
});

Deno.test("validate-customers: diferencias del PAC → status mismatch con campos", async () => {
  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          is_valid: false,
          errors: [{ path: "zip", message: "El CP no coincide" }],
        }),
        { status: 200 },
      ),
    )) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  const body = await res.json();
  assertEquals(body.mismatch, 1);
  assertEquals(body.results[0].errors[0].path, "zip");
});

Deno.test("validate-customers: datos incompletos → error sin llamar al PAC", async () => {
  const state = makeService({
    organizationCustomers: [{ ...ORG_A_LINK, domicilio_fiscal_cp: null }],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  let called = 0;
  const fetchImpl = (() => {
    called += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  const body = await res.json();
  assertEquals(called, 0);
  assertEquals(body.error, 1);
  assertEquals(body.results[0].errors[0].path, "domicilio_fiscal_cp");
});

Deno.test("validate-customers: error HTTP del PAC → status error", async () => {
  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  const fetchImpl = (() =>
    Promise.resolve(
      new Response("boom", { status: 502 }),
    )) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  const body = await res.json();
  assertEquals(body.error, 1);
  assertEquals(body.results[0].errors[0].code, "PAC_ERROR");
});

Deno.test("validate-customers: rol no permitido → 403", async () => {
  const state = makeService({
    role: "ventas",
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  const res = await handleValidateCustomers(req(), deps(state, fetch));
  await res.text();
  assertEquals(res.status, 403);
});

// ── Multiempresa · Fase 1: aislamiento fiscal ───────────────────────────

Deno.test("validate-customers: JWT service_role sin organización derivable → 403, no procesa nada", async () => {
  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  const res = await handleValidateCustomers(
    req(),
    deps(state, fetch, { role: "service_role", sub: "" }),
  );
  assertEquals(res.status, 403);
  assertEquals(state.updates.length, 0);
});

Deno.test("validate-customers: caller sin membresía de organización → 403", async () => {
  const state = makeService({
    membershipOrgId: null,
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  const res = await handleValidateCustomers(req(), deps(state, fetch));
  assertEquals(res.status, 403);
  assertEquals(state.updates.length, 0);
});

Deno.test("validate-customers: la corrida sólo toca clientes ligados a la organización del caller", async () => {
  // `organization_customers` ya viene acotado por organization_id; simulamos
  // que sólo el cliente de ORG_A vuelve aunque exista otro cliente global.
  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    customers: [
      { id: CUSTOMER_A_ID, name: "ACME (org A)" },
      { id: CUSTOMER_B_ID, name: "OTRA EMPRESA (no debe tocarse)" },
    ],
  });
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ is_valid: true }), { status: 200 }),
    )) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  const body = await res.json();
  assertEquals(body.processed, 1);
  assertEquals(body.results[0].customer_id, CUSTOMER_A_ID);
  const updatedIds = state.updates
    .filter((u) => u.table === "organization_customers")
    .map((u) => u.filters.find((f) => f.col === "customer_id")?.val);
  assertEquals(updatedIds, [CUSTOMER_A_ID]);
});

Deno.test("validate-customers: cliente compartido guarda el resultado sólo en la empresa B", async () => {
  const state = makeService({
    membershipOrgId: ORG_B,
    organizationCustomers: [{
      ...ORG_A_LINK,
      razon_social: "ACME BAJÍO SA DE CV",
      rfc: "BBB010101BBB",
    }],
  });
  const fetchImpl = (() => Promise.resolve(
    new Response(JSON.stringify({ is_valid: true }), { status: 200 }),
  )) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  assertEquals(res.status, 200);
  assertEquals(state.updates.length, 1);
  assertEquals(state.updates[0].table, "organization_customers");
  assertEquals(state.updates[0].filters.find((f) => f.col === "organization_id")?.val, ORG_B);
  assertEquals(state.updates[0].patch.sat_validation_status, "valid");
});

Deno.test("validate-customers: si cambia la ficha durante la consulta al PAC no guarda un resultado obsoleto", async () => {
  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    saveRows: [],
  });
  const fetchImpl = (() => Promise.resolve(
    new Response(JSON.stringify({ is_valid: true }), { status: 200 }),
  )) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  assertEquals(res.status, 409);
  assertEquals(state.updates[0].filters.find((f) => f.col === "updated_at")?.val,
    ORG_A_LINK.updated_at);
});

Deno.test("validate-customers: sin vínculos organization_customers → no procesa nada (200 vacío)", async () => {
  const state = makeService({
    organizationCustomers: [],
    customers: [{ id: CUSTOMER_B_ID, name: "OTRA EMPRESA" }],
  });
  const res = await handleValidateCustomers(req(), deps(state, fetch));
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.processed, 0);
  assertEquals(state.updates.length, 0);
});

Deno.test("validate-customers: empresa sin credenciales propias no reutiliza las de otra empresa", async () => {
  let calls = 0;
  const fetchImpl = (() => {
    calls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;

  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
    billingSecrets: { facturapi_test_key: null, facturapi_live_key: null },
    organizationsCount: [{ id: ORG_A }, { id: ORG_B }],
  });
  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals((body.error as string).includes(ORG_A), true);
  assertEquals(calls, 0);
});

Deno.test("validate-customers: flujo de una sola empresa sigue funcionando", async () => {
  const state = makeService({
    organizationCustomers: [ORG_A_LINK],
    customers: [{ id: CUSTOMER_A_ID, name: "ACME" }],
  });
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ is_valid: true }), { status: 200 }),
    )) as unknown as typeof fetch;
  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.processed, 1);
  assertEquals(body.valid, 1);
});
