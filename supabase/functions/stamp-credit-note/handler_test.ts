// Unit tests for stamp-credit-note pure handler (no network, no Supabase).
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleStampCreditNote, type StampCreditNoteDeps } from "./handler.ts";
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

const NC_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
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
  return new Request("https://example.com/stamp-credit-note", {
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
  deps: StampCreditNoteDeps;
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
      fetchImpl: opts.fetchImpl ?? globalThis.fetch,
      env: (k) => env[k],
    },
  };
}

const STAMPED_INVOICE = {
  id: INVOICE_ID,
  cfdi_status: "stamped",
  facturapi_invoice_id: "fapi_source",
  receptor_rfc: "XAXX010101000",
};

Deno.test("handler: rejects without Authorization header (401)", async () => {
  const { deps } = makeDeps({});
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: NC_ID }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("handler: returns 403 when user is not admin/administrativo", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "ventas" }], error: null } },
    },
  });
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: NC_ID }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("handler: returns 400 when credit_note_id is not a UUID", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: "bad" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("handler: returns 404 when credit note does not exist", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        credit_notes: { data: null, error: { code: "PGRST116" } },
      },
    },
  });
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: NC_ID }),
    deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("handler: returns 409 when credit note already stamped", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        credit_notes: {
          data: { id: NC_ID, cfdi_status: "stamped" },
          error: null,
        },
      },
    },
  });
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: NC_ID }),
    deps,
  );
  assertEquals(res.status, 409);
});

Deno.test("handler: returns 400 when source invoice is not stamped", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        credit_notes: {
          data: { id: NC_ID, invoice_id: INVOICE_ID },
          error: null,
        },
        invoices: {
          data: { id: INVOICE_ID, cfdi_status: "draft" },
          error: null,
        },
      },
    },
  });
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: NC_ID }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("handler: happy path calls Facturapi and persists UUID", async () => {
  const mock = installFacturapiMock({
    "/invoices": (req) =>
      req.method === "POST"
        ? facturapiOk({ id: "fapi_nc_1", uuid: "NC-UUID-OK" })
        : new Response("not found", { status: 404 }),
    "/invoices/fapi_nc_1/xml": () => xmlResponse("<xml/>"),
    "/invoices/fapi_nc_1/pdf": () =>
      pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          credit_notes: {
            data: {
              id: NC_ID,
              invoice_id: INVOICE_ID,
              tax_rate: 16,
              currency: "MXN",
              line_items: [{ description: "NC", quantity: 1, unit_price: 100 }],
            },
            error: null,
          },
          invoices: { data: STAMPED_INVOICE, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { credit_notes: { data: null, error: null } },
      },
    });
    const res = await handleStampCreditNote(
      makeRequest({ credit_note_id: NC_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.cfdi_uuid, "NC-UUID-OK");

    const stamped = serviceState.updates.find((u) =>
      u.table === "credit_notes" && u.patch.cfdi_status === "stamped"
    );
    assert(stamped, "expected stamped update on credit_notes");
    assertEquals(stamped!.patch.facturapi_invoice_id, "fapi_nc_1");
    assertEquals(mock.calls.filter((c) => c.method === "POST").length, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("handler: Facturapi 400 returns 502 and marks credit note as error", async () => {
  const mock = installFacturapiMock({
    "/invoices": () => facturapiBadRequest("Invalid"),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          credit_notes: {
            data: { id: NC_ID, invoice_id: INVOICE_ID, line_items: [] },
            error: null,
          },
          invoices: { data: STAMPED_INVOICE, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        updates: { credit_notes: { data: null, error: null } },
      },
    });
    const res = await handleStampCreditNote(
      makeRequest({ credit_note_id: NC_ID }),
      deps,
    );
    await res.json();
    assertEquals(res.status, 502);
    assert(serviceState.updates.some((u) => u.patch.cfdi_status === "error"));
    assert(
      !serviceState.updates.some((u) => u.patch.cfdi_status === "stamped"),
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
        credit_notes: {
          data: { id: NC_ID, invoice_id: INVOICE_ID },
          error: null,
        },
        invoices: { data: STAMPED_INVOICE, error: null },
        company_settings: { data: { facturapi_mode: "test" }, error: null },
        billing_secrets: { data: null, error: null },
      },
      updates: { credit_notes: { data: null, error: null } },
    },
  });
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: NC_ID }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.stub, true);
  assert(serviceState.updates.some((u) => u.patch.cfdi_status === "stamped"));
});
