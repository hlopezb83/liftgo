// Unit tests for stamp-payment-complement pure handler (no network, no Supabase).
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleStampPaymentComplement,
  type StampPaymentComplementDeps,
} from "./handler.ts";
import {
  buildSupabaseMock,
  type MockConfig,
} from "../_shared/test/supabaseClientMock.ts";
import {
  facturapiBadRequest,
  facturapiOk,
  installFacturapiMock,
  pdfResponse,
  xmlResponse,
} from "../_shared/test/facturapiMock.ts";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG_ID = "55555555-5555-4555-8555-555555555555";

function makeRequest(
  body: unknown,
  opts: { auth?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: "http://localhost:8080",
  };
  if (opts.auth !== null) {
    headers["Authorization"] = opts.auth ?? "Bearer test-token";
  }
  return new Request("https://example.com/stamp-payment-complement", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_PAYMENT = {
  id: PAYMENT_ID,
  organization_id: ORG_ID,
  invoice_id: INVOICE_ID,
  rep_cfdi_status: "pending",
  payment_form_sat: "03",
  payment_date: "2024-05-01",
  amount: 116,
  currency: "MXN",
};

const VALID_INVOICE = {
  id: INVOICE_ID,
  organization_id: ORG_ID,
  metodo_pago: "PPD",
  cfdi_status: "stamped",
  cfdi_uuid: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  moneda: "MXN",
  tipo_cambio: 1,
  tax_rate: 16,
  receptor_rfc: "XAXX010101000",
  line_items: [
    { description: "Servicio", quantity: 1, unit_price: 100, total: 100 },
  ],
};

function makeDeps(opts: {
  caller?: MockConfig;
  service?: MockConfig;
  env?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): {
  deps: StampPaymentComplementDeps;
  serviceState: ReturnType<typeof buildSupabaseMock>;
} {
  const caller = buildSupabaseMock(opts.caller ?? { claims: { sub: USER_ID } });
  const serviceConfig = opts.service ?? {};
  const service = buildSupabaseMock({
    ...serviceConfig,
    selects: {
      profiles: { data: { is_active: true }, error: null },
      organization_memberships: {
        data: [{ organization_id: ORG_ID, member_type: "internal" }],
        error: null,
      },
      organizations: { data: [{ id: ORG_ID }], error: null },
      ...(serviceConfig.selects ?? {}),
    },
    rpcs: {
      claim_payment_rep_stamping: { data: "claimed", error: null },
      prepare_payment_complement: {
        data: { installment_number: 1, prior_balance: 116 },
        error: null,
      },
      assign_stamped_rep_number: { data: "CP-0001", error: null },
      ...(serviceConfig.rpcs ?? {}),
    },
  });
  const env = opts.env ?? {};
  return {
    serviceState: service,
    deps: {
      createCallerClient: () => caller.client,
      createServiceClient: () => service.client,
      fetchImpl: opts.fetchImpl ?? globalThis.fetch,
      env: (k) => env[k],
    },
  };
}

Deno.test("handler: rejects without Authorization header (401)", async () => {
  const { deps } = makeDeps({});
  const res = await handleStampPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("handler: returns 403 when user is not admin/administrativo", async () => {
  const { deps } = makeDeps({
    service: {
      // `.in("role", ["admin","administrativo"]).maybeSingle()` no encuentra
      // fila para un usuario de ventas: el mock debe devolver null, no la fila.
      selects: { user_roles: { data: null, error: null } },
    },
  });
  const res = await handleStampPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("handler: returns 400 when payment_id is not a UUID", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleStampPaymentComplement(
    makeRequest({ payment_id: "not-a-uuid" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("handler: returns 404 when payment does not exist", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        payments: { data: null, error: null },
      },
    },
  });
  const res = await handleStampPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }),
    deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("handler: returns 409 when the REP is already stamped", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        payments: {
          data: { ...VALID_PAYMENT, rep_cfdi_status: "stamped" },
          error: null,
        },
      },
    },
  });
  const res = await handleStampPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }),
    deps,
  );
  assertEquals(res.status, 409);
});

Deno.test("handler: happy path calls Facturapi and persists REP", async () => {
  const mock = installFacturapiMock({
    "/invoices": (req) =>
      req.method === "POST"
        ? facturapiOk({
          id: "fapi_rep_1",
          uuid: "REP-UUID-OK",
          folio_number: 1,
        })
        : new Response("not found", { status: 404 }),
    "/invoices/fapi_rep_1/xml": () => xmlResponse("<xml/>"),
    "/invoices/fapi_rep_1/pdf": () =>
      pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          payments: { data: VALID_PAYMENT, error: null },
          invoices: { data: VALID_INVOICE, error: null },
          company_settings: {
            data: { facturapi_mode: "test", organization_id: ORG_ID },
            error: null,
          },
          billing_secrets: { data: null, error: null },
        },
        updates: { payments: { data: null, error: null } },
      },
    });
    const res = await handleStampPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.rep_cfdi_uuid, "REP-UUID-OK");

    const stampUpdate = serviceState.updates.find((u) =>
      u.table === "payments" && u.patch.rep_cfdi_status === "stamped"
    );
    assert(stampUpdate, "expected a stamped update on payments");
    assertEquals(stampUpdate!.patch.rep_facturapi_id, "fapi_rep_1");
  } finally {
    mock.restore();
  }
});

Deno.test("handler: Facturapi 400 returns 502 and marks REP as error", async () => {
  const mock = installFacturapiMock({
    "/invoices": () => facturapiBadRequest("Invalid"),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          payments: { data: VALID_PAYMENT, error: null },
          invoices: { data: VALID_INVOICE, error: null },
          company_settings: {
            data: { facturapi_mode: "test", organization_id: ORG_ID },
            error: null,
          },
          billing_secrets: { data: null, error: null },
        },
        updates: { payments: { data: null, error: null } },
      },
    });
    const res = await handleStampPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    await res.json();
    assertEquals(res.status, 502);
    assert(
      serviceState.updates.some((u) => u.patch.rep_cfdi_status === "error"),
    );
    assert(
      !serviceState.updates.some((u) => u.patch.rep_cfdi_status === "stamped"),
    );
  } finally {
    mock.restore();
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Multiempresa · Fase 1 — regresión de aislamiento fiscal
// ────────────────────────────────────────────────────────────────────────────

Deno.test("handler: MULTIEMPRESA rechaza pago de otra organización (403) sin updates ni PAC", async () => {
  let facturapiCalled = 0;
  const mock = installFacturapiMock({
    "/invoices": () => {
      facturapiCalled++;
      return facturapiOk({ id: "should_not_happen", uuid: "SHOULD-NOT" });
    },
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          payments: {
            data: { ...VALID_PAYMENT, organization_id: OTHER_ORG_ID },
            error: null,
          },
        },
      },
    });
    const res = await handleStampPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 403);
    assertEquals(body.error, "El documento pertenece a otra empresa.");
    assertEquals(
      serviceState.updates.length,
      0,
      "no debe tocarse el pago de otra organización",
    );
    assertEquals(facturapiCalled, 0, "el PAC nunca debe invocarse");
  } finally {
    mock.restore();
  }
});

Deno.test("handler: MULTIEMPRESA organización sin credenciales propias en modo live falla explícito (no reutiliza llaves ajenas)", async () => {
  let facturapiCalled = 0;
  const mock = installFacturapiMock({
    "/invoices": () => {
      facturapiCalled++;
      return facturapiOk({ id: "should_not_happen", uuid: "SHOULD-NOT" });
    },
  });
  try {
    const { deps, serviceState } = makeDeps({
      // Llave de entorno "ajena" (legado) presente, pero NO debe reutilizarse
      // porque ya existe más de una organización en la BD.
      env: { FACTURAPI_LIVE_KEY: "sk_live_ajena" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          payments: { data: VALID_PAYMENT, error: null },
          invoices: { data: VALID_INVOICE, error: null },
          company_settings: {
            data: { facturapi_mode: "live", organization_id: ORG_ID },
            error: null,
          },
          billing_secrets: { data: null, error: null },
          // Multiempresa: ya hay 2 organizaciones -> se retira el fallback legado.
          organizations: {
            data: [{ id: ORG_ID }, { id: OTHER_ORG_ID }],
            error: null,
          },
        },
        updates: { payments: { data: null, error: null } },
      },
    });
    const res = await handleStampPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 400);
    assert(String(body.error).includes("not configured"));
    assertEquals(facturapiCalled, 0, "no debe llamarse al PAC sin key propia");
    // El claim se libera a `pending` (reintentable) con el motivo explícito;
    // nunca se timbra con llaves de otra empresa.
    const released = serviceState.updates.find((u) =>
      u.table === "payments" && u.patch.rep_cfdi_status === "pending"
    );
    assert(released, "debe liberar el claim del pago");
    assert(
      String(released?.patch.rep_error_message ?? "").includes("empresa"),
      "el motivo debe señalar que falta configuración de esta empresa",
    );
  } finally {
    mock.restore();
  }
});

// ── Tramo 8.1: folio REP por empresa, sin éxito con folio nulo ──────────────

function repMock() {
  return installFacturapiMock({
    "/invoices": (req) =>
      req.method === "POST"
        ? facturapiOk({
          id: "fapi_rep_1",
          uuid: "REP-UUID-OK",
          folio_number: 1,
        })
        : new Response("not found", { status: 404 }),
    "/invoices/fapi_rep_1/xml": () => xmlResponse("<xml/>"),
    "/invoices/fapi_rep_1/pdf": () =>
      pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  });
}

function repDeps(rpcs?: MockConfig["rpcs"]) {
  return makeDeps({
    env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        payments: { data: VALID_PAYMENT, error: null },
        invoices: { data: VALID_INVOICE, error: null },
        company_settings: {
          data: { facturapi_mode: "test", organization_id: ORG_ID },
          error: null,
        },
        billing_secrets: { data: null, error: null },
      },
      updates: { payments: { data: null, error: null } },
      ...(rpcs ? { rpcs } : {}),
    },
  });
}

Deno.test("handler: el folio REP se pide con la organización verificada del pago", async () => {
  const mock = repMock();
  try {
    const { deps, serviceState } = repDeps();
    const res = await handleStampPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.rep_number, "CP-0001");
    const call = serviceState.rpcCalls.find((c) =>
      c.fn === "assign_stamped_rep_number"
    );
    assert(call, "debe llamarse al asignador de folio");
    assertEquals(call!.args?.p_organization_id, ORG_ID);
    assert(call!.args?.p_organization_id !== OTHER_ORG_ID);
  } finally {
    mock.restore();
  }
});

Deno.test("handler: colisión de folio NO devuelve éxito con rep_number nulo", async () => {
  const mock = repMock();
  try {
    const { deps, serviceState } = repDeps({
      claim_payment_rep_stamping: { data: "claimed", error: null },
      prepare_payment_complement: {
        data: { installment_number: 1, prior_balance: 116 },
        error: null,
      },
      assign_stamped_rep_number: {
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "payments_rep_number_uidx"',
        },
      },
    });
    const res = await handleStampPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 503);
    assertEquals(body.success, undefined);
    // El CFDI se conserva timbrado: no debe revertirse ni re-timbrarse.
    assert(
      serviceState.updates.some((u) => u.patch.rep_cfdi_status === "stamped"),
    );
    assert(
      !serviceState.updates.some((u) => u.patch.rep_cfdi_status === "error"),
    );
    const pending = serviceState.updates.find((u) =>
      typeof u.patch.rep_error_message === "string" &&
      u.patch.rep_cfdi_status === undefined
    );
    assert(pending, "debe quedar un motivo explícito para la recuperación");
  } finally {
    mock.restore();
  }
});

Deno.test("handler: rechaza asignar folio a un pago de otra organización", async () => {
  const mock = repMock();
  try {
    const { deps } = repDeps({
      claim_payment_rep_stamping: { data: "claimed", error: null },
      prepare_payment_complement: {
        data: { installment_number: 1, prior_balance: 116 },
        error: null,
      },
      assign_stamped_rep_number: {
        data: null,
        error: { message: "payment belongs to another organization" },
      },
    });
    const res = await handleStampPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    await res.json();
    assertEquals(res.status, 503);
  } finally {
    mock.restore();
  }
});

