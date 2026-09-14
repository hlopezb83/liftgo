// TESTS-ARQ2 v2 · DIFF 16: `validate-receptor-tax-info` no tenía cobertura.
// Este handler es la validación pre-timbre contra el SAT y su rama de "Público
// en General" (RFC XAXX010101000) NUNCA debe pegarle al PAC — de otra forma
// se dispararían llamadas Facturapi inútiles y latencia extra.
//
// Multiempresa · Fase 1: se agregan pruebas de regresión de aislamiento
// fiscal (organization_id derivado del servidor, nunca del body).
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleValidateReceptor } from "./handler.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import type { CallerLike } from "../_shared/authWithDeps.ts";

const AUTH_HDR = {
  Authorization: "Bearer t",
  "Content-Type": "application/json",
};

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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

function makeService(
  invoice: Record<string, unknown> | null,
  opts: {
    membershipOrgId?: string | null;
    billingSecrets?: Record<string, unknown> | null;
    companySettings?: Record<string, unknown> | null;
    organizationsCount?: Array<{ id: string }>;
  } = {},
): SupabaseLike {
  const membershipOrgId = opts.membershipOrgId === undefined
    ? ORG_A
    : opts.membershipOrgId;
  return buildSupabaseMock({
    selects: {
      user_roles: { data: [{ role: "admin" }], error: null },
      // M-1: authenticateWithDeps ahora verifica profiles.is_active.
      profiles: { data: { is_active: true }, error: null },
      invoices: {
        data: invoice,
        error: invoice ? null : { message: "not found" },
      },
      organization_memberships: membershipOrgId
        ? { data: [{ organization_id: membershipOrgId }], error: null }
        : { data: [], error: null },
      company_settings: opts.companySettings === undefined
        ? { data: { facturapi_mode: "test" }, error: null }
        : { data: opts.companySettings, error: null },
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
  }).client;
}

function baseDeps(
  invoice: Record<string, unknown> | null,
  fetchImpl: typeof fetch,
  opts?: Parameters<typeof makeService>[1],
  env?: (k: string) => string | undefined,
) {
  return {
    createCallerClient: () => makeCaller(),
    createServiceClient: () => makeService(invoice, opts),
    fetchImpl,
    env: env ?? ((_k: string) => undefined),
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
  const noAuthReq = new Request("http://localhost/validate", {
    method: "POST",
  });
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
    organization_id: ORG_A,
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
    organization_id: ORG_A,
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
    organization_id: ORG_A,
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
    Promise.resolve(
      new Response("service down", { status: 503 }),
    )) as unknown as typeof fetch;

  const invoice = {
    organization_id: ORG_A,
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

// ── Multiempresa · Fase 1: aislamiento fiscal ───────────────────────────

Deno.test("validate-receptor: factura de otra empresa → 403 sin llamar al PAC ni leer secretos de esa empresa", async () => {
  let calls = 0;
  const fetchImpl = ((..._args: unknown[]) => {
    calls += 1;
    return Promise.resolve(new Response("{}"));
  }) as unknown as typeof fetch;

  const invoice = {
    // El caller pertenece a ORG_A pero la factura es de ORG_B: se rechaza
    // ANTES de leer billing_secrets o llamar al PAC.
    organization_id: ORG_B,
    receptor_rfc: "MEBM250101ABC",
    receptor_razon_social: "CLIENTE DE OTRA EMPRESA",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "44444444-4444-4444-4444-444444444444" }),
    baseDeps(invoice, fetchImpl, { membershipOrgId: ORG_A }),
  );
  assertEquals(res.status, 403);
  assertStrictEquals(calls, 0);
});

Deno.test("validate-receptor: factura sin organización asignada → rechazada", async () => {
  const invoice = {
    organization_id: null,
    receptor_rfc: "MEBM250101ABC",
    receptor_razon_social: "CLIENTE",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "55555555-5555-5555-5555-555555555555" }),
    baseDeps(invoice, fetch, { membershipOrgId: ORG_A }),
  );
  assertEquals(res.status, 409);
});

Deno.test("validate-receptor: sin membresía de organización → 403, no opera sobre la factura", async () => {
  const invoice = {
    organization_id: ORG_A,
    receptor_rfc: "MEBM250101ABC",
    receptor_razon_social: "CLIENTE",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "66666666-6666-6666-6666-666666666666" }),
    baseDeps(invoice, fetch, { membershipOrgId: null }),
  );
  assertEquals(res.status, 403);
});

Deno.test("validate-receptor: empresa sin credenciales propias no reutiliza las de otra empresa", async () => {
  let calls = 0;
  const fetchImpl = ((..._args: unknown[]) => {
    calls += 1;
    return Promise.resolve(new Response("{}"));
  }) as unknown as typeof fetch;

  const invoice = {
    organization_id: ORG_A,
    receptor_rfc: "MEBM250101ABC",
    receptor_razon_social: "CLIENTE",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  };
  // Sin billing_secrets propios y con más de una organización dada de alta:
  // el fallback a llaves de entorno de "legado de una sola empresa" queda
  // deshabilitado. No debe timbrar con ninguna llave ajena.
  const res = await handleValidateReceptor(
    req({ invoice_id: "77777777-7777-7777-7777-777777777777" }),
    baseDeps(invoice, fetchImpl, {
      membershipOrgId: ORG_A,
      billingSecrets: { facturapi_test_key: null, facturapi_live_key: null },
      organizationsCount: [{ id: ORG_A }, { id: ORG_B }],
    }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
  assertEquals((body.error as string).includes(ORG_A), true);
  assertStrictEquals(calls, 0);
});

Deno.test("validate-receptor: flujo de una sola empresa sigue funcionando (fallback a llaves de entorno)", async () => {
  const fetchImpl = ((..._args: unknown[]) =>
    Promise.resolve(
      new Response(JSON.stringify({ is_valid: true, errors: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as unknown as typeof fetch;

  const invoice = {
    organization_id: ORG_A,
    receptor_rfc: "MEBM250101ABC",
    receptor_razon_social: "CLIENTE DE PRUEBA",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  };
  const res = await handleValidateReceptor(
    req({ invoice_id: "88888888-8888-8888-8888-888888888888" }),
    baseDeps(
      invoice,
      fetchImpl,
      {
        membershipOrgId: ORG_A,
        billingSecrets: { facturapi_test_key: null, facturapi_live_key: null },
        organizationsCount: [{ id: ORG_A }],
      },
      (k) => (k === "FACTURAPI_TEST_KEY" ? "sk_env_legacy" : undefined),
    ),
  );
  assertEquals(res.status, 200);
});
