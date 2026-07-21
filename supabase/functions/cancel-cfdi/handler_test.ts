// Unit tests for cancel-cfdi pure handler.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type CancelCfdiDeps, handleCancelCfdi } from "./handler.ts";
import {
  buildSupabaseMock,
  type MockConfig,
} from "../_shared/test/supabaseClientMock.ts";
import {
  facturapiOk,
  installFacturapiMock,
} from "../_shared/test/facturapiMock.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const SUB_UUID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest(
  body: unknown,
  opts: { auth?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:8080",
  };
  if (opts.auth !== null) headers["Authorization"] = opts.auth ?? "Bearer t";
  return new Request("https://example.com/cancel-cfdi", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeDeps(opts: {
  service?: MockConfig;
  env?: Record<string, string>;
  fetchImpl?: typeof fetch;
  callerClaims?: ({ sub?: string } & Record<string, unknown>) | null;
}) {
  const caller = buildSupabaseMock({
    claims: opts.callerClaims === undefined ? { sub: USER_ID } : opts
      .callerClaims,
  });
  const service = buildSupabaseMock(opts.service ?? {});
  const env = opts.env ?? {};
  const deps: CancelCfdiDeps = {
    createCallerClient: () => caller.client,
    createServiceClient: () => service.client,
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
    env: (k) => env[k],
  };
  return { deps, serviceState: service };
}

Deno.test("cancel-cfdi: 401 sin Authorization", async () => {
  const { deps } = makeDeps({});
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("cancel-cfdi: 403 si el rol no es admin/administrativo", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "ventas" }], error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("cancel-cfdi: 400 si invoice_id no es UUID", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: "x", motive: "02" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-cfdi: 400 si motivo no está en 01-04", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "99" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-cfdi: 400 motivo 01 sin substitution_uuid", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "01" }),
    deps,
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assert(String(body.error).includes("substitution_uuid"));
});

Deno.test("cancel-cfdi: 400 si la factura no está timbrada", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: {
          data: { cfdi_status: "draft", facturapi_invoice_id: null },
          error: null,
        },
      },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-cfdi: 403 si la factura es e2e", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: {
          data: { cfdi_status: "stamped", is_e2e: true },
          error: null,
        },
      },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("cancel-cfdi: stub (sin apiKey) marca aceptada y actualiza", async () => {
  const { deps, serviceState } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "administrativo" }], error: null },
        invoices: {
          data: { cfdi_status: "stamped", facturapi_invoice_id: null },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { invoices: { data: null, error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.stub, true);
  assertEquals(body.accepted, true);
  assertEquals(body.cancellation_status, "accepted");
  const upd = serviceState.updates.find((u) => u.table === "invoices");
  assert(upd, "expected an invoice update");
  assertEquals(upd!.patch.cfdi_status, "cancelled");
  assertEquals(upd!.patch.status, "cancelled");
});

Deno.test("cancel-cfdi: happy path llama a Facturapi DELETE y acepta", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_xyz": (req) => {
      assertEquals(req.method, "DELETE");
      return facturapiOk({ cancellation_status: "accepted" });
    },
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: { cfdi_status: "stamped", facturapi_invoice_id: "fapi_xyz" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { invoices: { data: null, error: null } },
      },
    });
    const res = await handleCancelCfdi(
      makeRequest({
        invoice_id: INVOICE_ID,
        motive: "01",
        substitution_uuid: SUB_UUID,
      }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.accepted, true);
    assertEquals(body.stub, false);
    assertEquals(mock.calls.length, 1);
    assert(mock.calls[0].url.includes("motive=01"));
    assert(mock.calls[0].url.includes("substitution="));
    const upd = serviceState.updates.find((u) => u.table === "invoices");
    assertEquals(upd!.patch.substitution_uuid, SUB_UUID);
  } finally {
    mock.restore();
  }
});

Deno.test("cancel-cfdi: SAT 'pending' devuelve warning y no marca cancelled", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_p": () => facturapiOk({ cancellation_status: "pending" }),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: { cfdi_status: "stamped", facturapi_invoice_id: "fapi_p" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { invoices: { data: null, error: null } },
      },
    });
    const res = await handleCancelCfdi(
      makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.accepted, false);
    assertEquals(body.cancellation_status, "pending");
    assert(typeof body.warning === "string");
    const upd = serviceState.updates.find((u) => u.table === "invoices");
    assertEquals(upd!.patch.cancellation_status, "pending");
    assertEquals(upd!.patch.cfdi_status, undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("cancel-cfdi: Facturapi 500 devuelve 502", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_e": () => new Response("oops", { status: 500 }),
  });
  try {
    const { deps } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: { cfdi_status: "stamped", facturapi_invoice_id: "fapi_e" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
      },
    });
    const res = await handleCancelCfdi(
      makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
      deps,
    );
    await res.text();
    assertEquals(res.status, 502);
  } finally {
    mock.restore();
  }
});

// C-2: en modo live, cancelaciones stub deben ser rechazadas (no marcar
// "aceptada" sin llamar al SAT).
Deno.test("cancel-cfdi: C-2 live sin apiKey rechaza cancelación stub", async () => {
  const { deps, serviceState } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: {
          data: { cfdi_status: "stamped", facturapi_invoice_id: "fapi_z" },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "live" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { invoices: { data: null, error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 400);
  assert(String(body.error).includes("API key no configurada"));
  // Y nunca actualizamos la factura.
  const upd = serviceState.updates.find((u) => u.table === "invoices");
  assertEquals(upd, undefined);
});

Deno.test("cancel-cfdi: C-2 live sin facturapi_invoice_id rechaza stub", async () => {
  const { deps, serviceState } = makeDeps({
    env: { FACTURAPI_LIVE_KEY: "sk_live" },
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: {
          data: { cfdi_status: "stamped", facturapi_invoice_id: null },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "live" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { invoices: { data: null, error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 400);
  assert(String(body.error).includes("facturapi_invoice_id"));
  const upd = serviceState.updates.find((u) => u.table === "invoices");
  assertEquals(upd, undefined);
});

// BL-A4: bloquear cancelación cuando la factura tiene pagos aplicados.
Deno.test("cancel-cfdi: BL-A4 rechaza 409 si hay pagos aplicados", async () => {
  const { deps, serviceState } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: {
          data: { cfdi_status: "stamped", facturapi_invoice_id: null },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { invoices: { data: null, error: null } },
      rpcs: {
        assert_invoice_cancellable: {
          data:
            "La factura tiene 2 pago(s) aplicado(s) por $10,000.00. Elimina o reversa los pagos antes de cancelar el CFDI.",
          error: null,
        },
      },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 409);
  assert(String(body.error).includes("pago"));
  // Ningún update: la factura sigue timbrada.
  const upd = serviceState.updates.find((u) => u.table === "invoices");
  assertEquals(upd, undefined);
});

// EC-A1: bypass service_role para el consumer de cfdi_retry_queue.
Deno.test("cancel-cfdi: EC-A1 service_role JWT salta la verificación de rol", async () => {
  const { deps, serviceState } = makeDeps({
    callerClaims: { role: "service_role" },
    env: {},
    service: {
      // Sin entrada user_roles: si el bypass no funcionara, el lookup
      // devolvería null y la función respondería 403.
      selects: {
        invoices: {
          data: { cfdi_status: "stamped", facturapi_invoice_id: null },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { invoices: { data: null, error: null } },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.stub, true);
  const upd = serviceState.updates.find((u) => u.table === "invoices");
  assert(upd, "expected an invoice update via service_role bypass");
  assertEquals(upd!.patch.cfdi_status, "cancelled");
});

// BL-44: errores transitorios (5xx/red/429) encolan reintento en cfdi_retry_queue.
Deno.test("cancel-cfdi: BL-44 Facturapi 500 encola reintento con payload plano", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_500": () => new Response("oops", { status: 500 }),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: { cfdi_status: "stamped", facturapi_invoice_id: "fapi_500" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
          cfdi_retry_queue: { data: { id: "q-1" }, error: null },
        },
      },
    });
    const res = await handleCancelCfdi(
      makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 502);
    assertEquals(body.transient, true);
    // La cancelación quedó encolada para el consumer.
    const enq = serviceState.inserts.find((i) => i.table === "cfdi_retry_queue");
    assert(enq, "expected an insert into cfdi_retry_queue");
    const row = enq!.row as Record<string, unknown>;
    assertEquals(row.operation, "cancel");
    assertEquals(row.invoice_id, INVOICE_ID);
    assertEquals(row.status, "pending");
    assertEquals(row.attempts, 0);
    // Payload plano: el consumer lo esparce tal cual al reinvocar cancel-cfdi.
    const payload = row.payload as Record<string, unknown>;
    assertEquals(payload.motive, "02");
    assertEquals(payload.substitution_uuid, undefined);
    // Y la factura NO se tocó (la cancelación no llegó al SAT).
    const upd = serviceState.updates.find((u) => u.table === "invoices");
    assertEquals(upd, undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("cancel-cfdi: BL-44 Facturapi 400 (negocio) NO encola reintento", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_400": () =>
      new Response(JSON.stringify({ message: "Invalid RFC" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: { cfdi_status: "stamped", facturapi_invoice_id: "fapi_400" },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
      },
    });
    const res = await handleCancelCfdi(
      makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 502);
    assertEquals(body.transient, false);
    const enq = serviceState.inserts.find((i) => i.table === "cfdi_retry_queue");
    assertEquals(enq, undefined);
  } finally {
    mock.restore();
  }
});

// BL-A4: cuando el RPC devuelve null (sin pagos) la cancelación procede.
Deno.test("cancel-cfdi: BL-A4 sin pagos, RPC null, procede la cancelación stub en test", async () => {
  const { deps, serviceState } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: {
          data: { cfdi_status: "stamped", facturapi_invoice_id: null },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { invoices: { data: null, error: null } },
      rpcs: {
        assert_invoice_cancellable: { data: null, error: null },
      },
    },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "02" }),
    deps,
  );
  assertEquals(res.status, 200);
  const upd = serviceState.updates.find((u) => u.table === "invoices");
  assert(upd, "expected invoice update");
});
