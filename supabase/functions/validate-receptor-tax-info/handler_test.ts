// TESTS-ARQ2 v2 · DIFF 16: `validate-receptor-tax-info` no tenía cobertura.
// Este handler es la validación pre-timbre contra el SAT y su rama de "Público
// en General" (RFC XAXX010101000) NUNCA debe pegarle al PAC — de otra forma
// se dispararían llamadas Facturapi inútiles y latencia extra.
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleValidateReceptor } from "./handler.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { CallerLike } from "../_shared/authWithDeps.ts";

const AUTH_HDR = { Authorization: "Bearer t", "Content-Type": "application/json" };

function makeCaller(claims: Record<string, unknown> | null = {
  role: "authenticated",
  sub: "u-1",
}): CallerLike {
  return {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: claims ? { claims } : null,
          error: null,
        }),
    },
  };
}

function makeService(invoice: Record<string, unknown> | null): SupabaseLike {
  return buildSupabaseMock({
    selects: {
      user_roles: { data: [{ role: "admin" }], error: null },
      invoices: { data: invoice, error: invoice ? null : { message: "not found" } },
      company_settings: { data: { facturapi_mode: "test" }, error: null },
      billing_secrets: {
        data: { facturapi_test_key: "sk_test_x", facturapi_live_key: null },
        error: null,
      },
    },
  }).client;
}

function baseDeps(invoice: Record<string, unknown> | null, fetchImpl: typeof fetch) {
  return {
    createCallerClient: () => makeCaller(),
    createServiceClient: () => makeService(invoice),
    fetchImpl,
    env: (_k: string) => undefined,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/validate", {
    method: "POST",
    headers: AUTH_HDR,
    body: JSON.stringify(body),
  });
}

Deno.test("validate-receptor: sin auth → 401", async () => {
  const noAuthReq = new Request("http://localhost/validate", { method: "POST" });
  const res = await handleValidateReceptor(noAuthReq, {
    createCallerClient: () => makeCaller(),
    createServiceClient: () => makeService(null),
    fetchImpl: fetch,
    env: () => undefined,
  });
  assertEquals(res.status, 401);
});

Deno.test("validate-receptor: invoice_id no UUID → 400", async () => {
  const res = await handleValidateReceptor(
    req({ invoice_id: "not-a-uuid" }),
    baseDeps(null, fetch),
  );
  assertEquals(res.status, 400);
});

Deno.test("validate-receptor: RFC XAXX010101000 → bypass sin llamar al PAC", async () => {
  let calls = 0;
  const fetchImpl = ((..._args: unknown[]) => {
    calls += 1;
    return Promise.resolve(new Response("{}"));
  }) as unknown as typeof fetch;

  const invoice = {
    receptor_rfc: "XAXX010101000",
    receptor_razon_social: "PUBLICO EN GENERAL",
    receptor_regimen_fiscal: "616",
    receptor_domicilio_fiscal_cp: "06600",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "11111111-1111-1111-1111-111111111111" }),
    baseDeps(invoice, fetchImpl),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.is_valid, true);
  assertStrictEquals(calls, 0);
});

Deno.test("validate-receptor: datos fiscales incompletos → 400 sin llamar al PAC", async () => {
  let calls = 0;
  const fetchImpl = ((..._args: unknown[]) => {
    calls += 1;
    return Promise.resolve(new Response("{}"));
  }) as unknown as typeof fetch;

  const invoice = {
    receptor_rfc: "MEBM250101ABC",
    // Falta razón social / régimen / CP.
    receptor_razon_social: "",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "11111111-1111-1111-1111-111111111111" }),
    baseDeps(invoice, fetchImpl),
  );
  assertEquals(res.status, 400);
  assertStrictEquals(calls, 0);
});

Deno.test("validate-receptor: PAC responde 200 is_valid=true → 200 con errors=[]", async () => {
  const fetchImpl = ((..._args: unknown[]) =>
    Promise.resolve(
      new Response(JSON.stringify({ is_valid: true, errors: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as unknown as typeof fetch;

  const invoice = {
    receptor_rfc: "MEBM250101ABC",
    receptor_razon_social: "CLIENTE DE PRUEBA",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "22222222-2222-2222-2222-222222222222" }),
    baseDeps(invoice, fetchImpl),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.is_valid, true);
  assertEquals(body.errors, []);
  assertEquals(body.sent.tax_id, "MEBM250101ABC");
});

Deno.test("validate-receptor: PAC 5xx → 502 con detail (nunca 200 accidental)", async () => {
  const fetchImpl = ((..._args: unknown[]) =>
    Promise.resolve(new Response("service down", { status: 503 }))) as unknown as typeof fetch;

  const invoice = {
    receptor_rfc: "MEBM250101ABC",
    receptor_razon_social: "CLIENTE",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "33333333-3333-3333-3333-333333333333" }),
    baseDeps(invoice, fetchImpl),
  );
  assertEquals(res.status, 502);
});
