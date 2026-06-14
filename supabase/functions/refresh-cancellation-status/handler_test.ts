// Unit tests for refresh-cancellation-status pure handler.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleRefreshCancellation,
  type RefreshCancellationDeps,
} from "./handler.ts";
import {
  buildSupabaseMock,
  type MockConfig,
} from "../_shared/test/supabaseClientMock.ts";
import {
  facturapiOk,
  installFacturapiMock,
} from "../_shared/test/facturapiMock.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: unknown, opts: { auth?: string | null } = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:8080",
  };
  if (opts.auth !== null) headers["Authorization"] = opts.auth ?? "Bearer t";
  return new Request("https://example.com/refresh-cancellation-status", {
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
  const deps: RefreshCancellationDeps = {
    createCallerClient: () => caller.client,
    createServiceClient: () => service.client,
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
    env: (k) => env[k],
  };
  return { deps, serviceState: service };
}

Deno.test("refresh-cancellation: 401 sin Authorization", async () => {
  const { deps } = makeDeps({});
  const res = await handleRefreshCancellation(
    makeRequest({ invoice_id: INVOICE_ID }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("refresh-cancellation: 403 si no es admin/administrativo", async () => {
  const { deps } = makeDeps({
    service: { selects: { user_roles: { data: [{ role: "ventas" }], error: null } } },
  });
  const res = await handleRefreshCancellation(
    makeRequest({ invoice_id: INVOICE_ID }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("refresh-cancellation: 400 si invoice_id no es UUID", async () => {
  const { deps } = makeDeps({
    service: { selects: { user_roles: { data: [{ role: "admin" }], error: null } } },
  });
  const res = await handleRefreshCancellation(
    makeRequest({ invoice_id: "x" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("refresh-cancellation: 404 si la factura no tiene facturapi_invoice_id", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: { data: { facturapi_invoice_id: null }, error: null },
      },
    },
  });
  const res = await handleRefreshCancellation(
    makeRequest({ invoice_id: INVOICE_ID }),
    deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("refresh-cancellation: 400 sin Facturapi key", async () => {
  const { deps } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: { data: { facturapi_invoice_id: "fapi_1" }, error: null },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
    },
  });
  const res = await handleRefreshCancellation(
    makeRequest({ invoice_id: INVOICE_ID }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("refresh-cancellation: SAT accepted marca cancelled", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_1/status": (req) => {
      assertEquals(req.method, "PUT");
      return new Response("", { status: 200 });
    },
    "/invoices/fapi_1": () => facturapiOk({ cancellation_status: "accepted" }),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: { data: { facturapi_invoice_id: "fapi_1" }, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { invoices: { data: null, error: null } },
      },
    });
    const res = await handleRefreshCancellation(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.cancellation_status, "accepted");
    const upd = serviceState.updates.find((u) => u.table === "invoices");
    assert(upd, "expected invoice update");
    assertEquals(upd!.patch.cfdi_status, "cancelled");
    assertEquals(upd!.patch.status, "cancelled");
  } finally {
    mock.restore();
  }
});

Deno.test("refresh-cancellation: SAT pending NO marca cancelled", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_p/status": () => new Response("", { status: 200 }),
    "/invoices/fapi_p": () => facturapiOk({ cancellation_status: "pending" }),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: { data: { facturapi_invoice_id: "fapi_p" }, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { invoices: { data: null, error: null } },
      },
    });
    const res = await handleRefreshCancellation(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.cancellation_status, "pending");
    const upd = serviceState.updates.find((u) => u.table === "invoices");
    assertEquals(upd!.patch.cfdi_status, undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("refresh-cancellation: Facturapi PUT falla -> 502", async () => {
  const mock = installFacturapiMock({
    "/invoices/fapi_e/status": () => new Response("err", { status: 500 }),
  });
  try {
    const { deps } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: { data: { facturapi_invoice_id: "fapi_e" }, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
      },
    });
    const res = await handleRefreshCancellation(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    await res.text();
    assertEquals(res.status, 502);
  } finally {
    mock.restore();
  }
});
