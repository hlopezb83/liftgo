// Unit tests for cancel-cfdi pure handler.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCancelCfdi, type CancelCfdiDeps } from "./handler.ts";
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
}) {
  const caller = buildSupabaseMock({ claims: { sub: USER_ID } });
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
    service: { selects: { user_roles: { data: [{ role: "admin" }], error: null } } },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: "x", motive: "02" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-cfdi: 400 si motivo no está en 01-04", async () => {
  const { deps } = makeDeps({
    service: { selects: { user_roles: { data: [{ role: "admin" }], error: null } } },
  });
  const res = await handleCancelCfdi(
    makeRequest({ invoice_id: INVOICE_ID, motive: "99" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-cfdi: 400 motivo 01 sin substitution_uuid", async () => {
  const { deps } = makeDeps({
    service: { selects: { user_roles: { data: [{ role: "admin" }], error: null } } },
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
        invoices: { data: { cfdi_status: "stamped", is_e2e: true }, error: null },
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
