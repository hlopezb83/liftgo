// Unit tests for cancel-payment-complement pure handler.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CancelRepDeps,
  handleCancelPaymentComplement,
} from "./handler.ts";
import {
  buildSupabaseMock,
  type MockConfig,
} from "../_shared/test/supabaseClientMock.ts";
import {
  facturapiBadRequest,
  installFacturapiMock,
} from "../_shared/test/facturapiMock.ts";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(
  body: unknown,
  opts: { auth?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:8080",
  };
  if (opts.auth !== null) {
    headers["Authorization"] = opts.auth ?? "Bearer test-token";
  }
  return new Request("https://example.com/cancel-payment-complement", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeDeps(opts: {
  service?: MockConfig;
  env?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): {
  deps: CancelRepDeps;
  serviceState: ReturnType<typeof buildSupabaseMock>;
} {
  const caller = buildSupabaseMock({ claims: { sub: USER_ID } });
  const service = buildSupabaseMock(opts.service ?? {});
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

Deno.test("handler: 401 sin Authorization", async () => {
  const { deps } = makeDeps({});
  const res = await handleCancelPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("handler: 403 si no admin/administrativo", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "ventas" }], error: null } },
    },
  });
  const res = await handleCancelPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("handler: 400 si payment_id no es UUID", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleCancelPaymentComplement(
    makeRequest({ payment_id: "bad" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("handler: 404 si payment no existe", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        payments: { data: null, error: null },
      },
    },
  });
  const res = await handleCancelPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }),
    deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("handler: 400 si REP no está timbrado", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        payments: {
          data: { rep_cfdi_status: "draft", rep_facturapi_id: null },
          error: null,
        },
      },
    },
  });
  const res = await handleCancelPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("handler: 400 si no hay API key configurada", async () => {
  const { deps } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        payments: {
          data: { rep_cfdi_status: "stamped", rep_facturapi_id: "fapi_xx" },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
    },
  });
  const res = await handleCancelPaymentComplement(
    makeRequest({ payment_id: PAYMENT_ID }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("handler: happy path llama Facturapi DELETE y marca cancelled", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_xx": (req) =>
      req.method === "DELETE"
        ? new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
        : new Response("not found", { status: 404 }),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          payments: {
            data: { rep_cfdi_status: "stamped", rep_facturapi_id: "fapi_xx" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { payments: { data: null, error: null } },
      },
    });
    const res = await handleCancelPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID, motive: "02" }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.success, true);

    const upd = serviceState.updates.find((u) =>
      u.table === "payments" && u.patch.rep_cfdi_status === "cancelled"
    );
    assert(upd, "expected cancelled update");
    assert(typeof upd!.patch.rep_cancelled_at === "string");
    assert(
      mock.calls.some((c) =>
        c.method === "DELETE" && c.url.includes("motive=02")
      ),
    );
  } finally {
    mock.restore();
  }
});

Deno.test("handler: 502 si Facturapi falla y NO marca cancelled", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_xx": () => facturapiBadRequest("ya cancelado"),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          payments: {
            data: { rep_cfdi_status: "stamped", rep_facturapi_id: "fapi_xx" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { payments: { data: null, error: null } },
      },
    });
    const res = await handleCancelPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID }),
      deps,
    );
    await res.json();
    assertEquals(res.status, 502);
    assert(
      !serviceState.updates.some((u) =>
        u.patch.rep_cfdi_status === "cancelled"
      ),
    );
  } finally {
    mock.restore();
  }
});

Deno.test("handler: motivo inválido cae a default '02'", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_xx": () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
  });
  try {
    const { deps } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          payments: {
            data: { rep_cfdi_status: "stamped", rep_facturapi_id: "fapi_xx" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { payments: { data: null, error: null } },
      },
    });
    const res = await handleCancelPaymentComplement(
      makeRequest({ payment_id: PAYMENT_ID, motive: "99" }),
      deps,
    );
    await res.json();
    assertEquals(res.status, 200);
    assert(mock.calls.some((c) => c.url.includes("motive=02")));
  } finally {
    mock.restore();
  }
});
