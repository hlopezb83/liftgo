// Cobertura de la validación masiva de la cartera contra el SAT.
// Verifica: rol requerido, guardado del resultado por cliente, detección de
// datos faltantes sin pegarle al PAC, y manejo de error del PAC.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleValidateCustomers } from "./handler.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { CallerLike } from "../_shared/authWithDeps.ts";

const AUTH_HDR = {
  Authorization: "Bearer t",
  "Content-Type": "application/json",
};

function makeCaller(): CallerLike {
  return {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: { claims: { role: "authenticated", sub: "u-1" } },
          error: null,
        }),
    },
  };
}

function makeService(customers: unknown[], role = "admin") {
  return buildSupabaseMock({
    selects: {
      user_roles: { data: [{ role }], error: null },
      profiles: { data: { is_active: true }, error: null },
      customers: { data: customers, error: null },
      company_settings: { data: { facturapi_mode: "test" }, error: null },
      billing_secrets: {
        data: { facturapi_test_key: "sk_test_x", facturapi_live_key: null },
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

const FULL_CUSTOMER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "ACME",
  rfc: "AAA010101AAA",
  razon_social: "ACME SA DE CV",
  regimen_fiscal: "601",
  domicilio_fiscal_cp: "64000",
};

function deps(
  state: ReturnType<typeof makeService>,
  fetchImpl: typeof fetch,
) {
  return {
    createCallerClient: () => makeCaller(),
    createServiceClient: () => state.client as SupabaseLike,
    fetchImpl,
    env: (_k: string) => undefined,
    sleep: () => Promise.resolve(),
  };
}

Deno.test("validate-customers: sin Authorization → 401", async () => {
  const state = makeService([]);
  const res = await handleValidateCustomers(
    new Request("http://localhost/validate-customers", { method: "POST" }),
    deps(state, fetch),
  );
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("validate-customers: cliente válido según el PAC → status valid", async () => {
  const state = makeService([FULL_CUSTOMER]);
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ is_valid: true }), { status: 200 }),
    )) as unknown as typeof fetch;

  const res = await handleValidateCustomers(req(), deps(state, fetchImpl));
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.processed, 1);
  assertEquals(body.valid, 1);
  const upd = state.updates.find((u) => u.table === "customers");
  assertEquals(upd?.patch.sat_validation_status, "valid");
});

Deno.test("validate-customers: diferencias del PAC → status mismatch con campos", async () => {
  const state = makeService([FULL_CUSTOMER]);
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
  const state = makeService([{ ...FULL_CUSTOMER, domicilio_fiscal_cp: null }]);
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
  const state = makeService([FULL_CUSTOMER]);
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
  const state = makeService([FULL_CUSTOMER], "ventas");
  const res = await handleValidateCustomers(req(), deps(state, fetch));
  await res.text();
  assertEquals(res.status, 403);
});
