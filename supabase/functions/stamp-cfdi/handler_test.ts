// Unit tests for stamp-cfdi pure handler (no network, no Supabase).
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleStampCfdi, type StampCfdiDeps } from "./handler.ts";
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

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "http://localhost:8080";

function makeRequest(
  body: unknown,
  opts: { auth?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": ORIGIN,
  };
  if (opts.auth !== null) {
    headers["Authorization"] = opts.auth ?? "Bearer test-token";
  }
  return new Request("https://example.com/stamp-cfdi", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeDeps(opts: {
  caller?: MockConfig;
  service?: MockConfig;
  env?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): {
  deps: StampCfdiDeps;
  serviceState: ReturnType<typeof buildSupabaseMock>;
} {
  const caller = buildSupabaseMock(opts.caller ?? { claims: { sub: USER_ID } });
  const service = buildSupabaseMock(opts.service ?? {});
  const env = opts.env ?? {};
  return {
    serviceState: service,
    deps: {
      createCallerClient: () => caller.client,
      createServiceClient: () => service.client,
      fetchImpl: opts.fetchImpl ?? (globalThis.fetch),
      env: (k) => env[k],
    },
  };
}

Deno.test("handler: rejects without Authorization header (401)", async () => {
  const { deps } = makeDeps({});
  const res = await handleStampCfdi(
    makeRequest({ invoice_id: INVOICE_ID }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("handler: returns 403 when user is not admin/administrativo", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "ventas" }], error: null },
      },
    },
  });
  const res = await handleStampCfdi(
    makeRequest({ invoice_id: INVOICE_ID }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("handler: returns 400 when invoice_id is not a UUID", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleStampCfdi(
    makeRequest({ invoice_id: "not-a-uuid" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("handler: returns 404 when invoice does not exist", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: { data: null, error: { code: "PGRST116" } },
      },
    },
  });
  const res = await handleStampCfdi(
    makeRequest({ invoice_id: INVOICE_ID }),
    deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("handler: refuses to stamp E2E invoices (403)", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        invoices: { data: { id: INVOICE_ID, is_e2e: true }, error: null },
      },
    },
  });
  const res = await handleStampCfdi(
    makeRequest({ invoice_id: INVOICE_ID }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("handler: happy path calls Facturapi and persists UUID", async () => {
  const mock = installFacturapiMock({
    "/invoices": (req) => {
      if (req.method === "POST") {
        return facturapiOk({ id: "fapi_123", uuid: "CFDI-UUID-OK" });
      }
      return new Response("not found", { status: 404 });
    },
    "/invoices/fapi_123/xml": () => xmlResponse("<xml/>"),
    "/invoices/fapi_123/pdf": () =>
      pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  });

  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: {
              id: INVOICE_ID,
              total: 1160,
              subtotal: 1000,
              tax_rate: 16,
              line_items: [{
                description: "Renta",
                quantity: 1,
                unit_price: 1000,
              }],
              receptor_rfc: "XAXX010101000",
            },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { invoices: { data: null, error: null } },
      },
    });

    const res = await handleStampCfdi(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.cfdi_uuid, "CFDI-UUID-OK");
    assertEquals(body.stub, false);

    // Verify the update persisted the UUID and stamped status.
    const stampUpdate = serviceState.updates.find((u) =>
      u.table === "invoices" && u.patch.cfdi_status === "stamped"
    );
    assert(stampUpdate, "expected a stamped update on invoices");
    assertEquals(stampUpdate!.patch.cfdi_uuid, "CFDI-UUID-OK");
    assertEquals(stampUpdate!.patch.facturapi_invoice_id, "fapi_123");

    // Facturapi was called for create + xml + pdf.
    assertEquals(
      mock.calls.filter((c) =>
        c.url.endsWith("/v2/invoices") && c.method === "POST"
      ).length,
      1,
    );
    assert(mock.calls.some((c) => c.url.endsWith("/xml")));
    assert(mock.calls.some((c) => c.url.endsWith("/pdf")));
  } finally {
    mock.restore();
  }
});

Deno.test("handler: Facturapi 400 returns 502 and marks invoice as error", async () => {
  const mock = installFacturapiMock({
    "/invoices": () => facturapiBadRequest("Invalid RFC"),
  });

  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      fetchImpl: globalThis.fetch,
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: {
              id: INVOICE_ID,
              total: 1160,
              subtotal: 1000,
              tax_rate: 16,
              line_items: [],
            },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { invoices: { data: null, error: null } },
      },
    });

    const res = await handleStampCfdi(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    await res.json();
    assertEquals(res.status, 502);

    const errUpdate = serviceState.updates.find((u) =>
      u.table === "invoices" && u.patch.cfdi_status === "error"
    );
    assert(errUpdate, "expected an error update on invoices");
    // Must NOT have a stamped update.
    assert(
      !serviceState.updates.some((u) => u.patch.cfdi_status === "stamped"),
      "must not mark invoice as stamped on PAC failure",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("handler: stub mode (no API key) returns stub:true UUID", async () => {
  const { deps, serviceState } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "administrativo" }], error: null },
        invoices: {
          data: {
            id: INVOICE_ID,
            total: 1000,
            subtotal: 862,
            serie: "A",
            folio: "1",
          },
          error: null,
        },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { invoices: { data: null, error: null } },
    },
  });

  const res = await handleStampCfdi(
    makeRequest({ invoice_id: INVOICE_ID }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.stub, true);
  assert(typeof body.cfdi_uuid === "string" && body.cfdi_uuid.length > 0);

  const stampUpdate = serviceState.updates.find((u) =>
    u.patch.cfdi_status === "stamped"
  );
  assert(stampUpdate, "stub mode still stamps the invoice in DB");
});
