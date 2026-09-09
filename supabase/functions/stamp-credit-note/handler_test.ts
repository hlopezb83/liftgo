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
    Origin: "http://localhost:8080",
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
  const serviceConfig = opts.service ?? {};
  const configuredCreditNote = serviceConfig.selects?.credit_notes?.data;
  const defaultClaim =
    configuredCreditNote && typeof configuredCreditNote === "object"
      ? {
          ...(configuredCreditNote as Record<string, unknown>),
          cfdi_status: "stamping",
        }
      : null;
  const service = buildSupabaseMock({
    ...serviceConfig,
    selects: {
      // M-1: authenticateWithDeps ahora verifica profiles.is_active — default
      // cuenta activa para no repetir el mock en cada test.
      profiles: { data: { is_active: true }, error: null },
      ...(serviceConfig.selects ?? {}),
    },
    rpcs: {
      claim_credit_note_for_stamping: { data: defaultClaim, error: null },
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

const STAMPED_INVOICE = {
  id: INVOICE_ID,
  cfdi_status: "stamped",
  facturapi_invoice_id: "fapi_source",
  cfdi_uuid: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  receptor_rfc: "XAXX010101000",
  tax_rate: 16,
  subtotal: 100,
  tax_amount: 16,
  total: 116,
  line_items: [
    {
      description: "Servicio fuente",
      quantity: 1,
      unit_price: 100,
      total: 100,
      clave_prod_serv: "78101803",
      clave_unidad: "E48",
      objeto_imp: "02",
    },
  ],
};

const VALID_CREDIT_NOTE = {
  id: NC_ID,
  invoice_id: INVOICE_ID,
  tax_rate: 16,
  currency: "MXN",
  subtotal: 100,
  tax_amount: 16,
  total: 116,
  line_items: [
    {
      description: "Texto editable ignorado",
      quantity: 1,
      unit_price: 100,
      source_line_index: 0,
    },
  ],
};

async function runSourceValidationCase(
  creditNote: Record<string, unknown>,
  sourceInvoice: Record<string, unknown> = STAMPED_INVOICE,
) {
  const mock = installFacturapiMock({
    "/invoices": () => facturapiOk({ id: "must_not_stamp", uuid: "NOPE" }),
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          credit_notes: { data: creditNote, error: null },
          invoices: { data: sourceInvoice, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        selectsSeq: {
          credit_notes: [
            { data: creditNote, error: null },
            { data: [], error: null },
          ],
        },
        updatesSeq: {
          credit_notes: [{ data: { id: NC_ID }, error: null }],
        },
        updates: { credit_notes: { data: null, error: null } },
      },
    });
    const res = await handleStampCreditNote(
      makeRequest({ credit_note_id: NC_ID }),
      deps,
    );
    const body = (await res.json()) as Record<string, unknown>;
    return {
      status: res.status,
      body,
      facturapiPostCount: mock.calls.filter((call) => call.method === "POST")
        .length,
      serviceState,
    };
  } finally {
    mock.restore();
  }
}

Deno.test("handler: rejects without Authorization header (401)", async () => {
  const { deps } = makeDeps({});
  const res = await handleStampCreditNote(
    makeRequest({ credit_note_id: NC_ID }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test(
  "handler: returns 403 when user is not admin/administrativo",
  async () => {
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
  },
);

Deno.test(
  "handler: returns 400 when credit_note_id is not a UUID",
  async () => {
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
  },
);

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

Deno.test(
  "handler: returns 400 when source invoice is not stamped",
  async () => {
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
  },
);

Deno.test(
  "handler: borrador legacy sin source_line_index exige recreación antes del PAC",
  async () => {
    const result = await runSourceValidationCase({
      ...VALID_CREDIT_NOTE,
      line_items: [{ quantity: 1, unit_price: 100 }],
    });

    assertEquals(result.status, 422);
    assertEquals(result.body.code, "CREDIT_NOTE_RECREATE_REQUIRED");
    assertEquals(result.body.recreate_required, true);
    assert(String(result.body.error).includes("source_line_index"));
    assertEquals(result.facturapiPostCount, 0);
  },
);

Deno.test(
  "handler: rechaza source_line_index fuera de rango antes del PAC",
  async () => {
    const result = await runSourceValidationCase({
      ...VALID_CREDIT_NOTE,
      line_items: [{ quantity: 1, unit_price: 100, source_line_index: 4 }],
    });

    assertEquals(result.status, 422);
    assertEquals(result.body.code, "INVALID_SOURCE_LINE_INDEX");
    assertEquals(result.facturapiPostCount, 0);
  },
);

Deno.test(
  "handler: rechaza source_line_index duplicado antes del PAC",
  async () => {
    const result = await runSourceValidationCase({
      ...VALID_CREDIT_NOTE,
      line_items: [
        { quantity: 0.5, unit_price: 100, source_line_index: 0 },
        { quantity: 0.5, unit_price: 100, source_line_index: 0 },
      ],
    });

    assertEquals(result.status, 422);
    assertEquals(result.body.code, "DUPLICATE_SOURCE_LINE_INDEX");
    assertEquals(result.facturapiPostCount, 0);
  },
);

Deno.test(
  "handler: limita cantidad y precio unitario a la partida fuente",
  async () => {
    for (const line of [
      { quantity: 2, unit_price: 100, source_line_index: 0 },
      { quantity: 1, unit_price: 100.01, source_line_index: 0 },
    ]) {
      const result = await runSourceValidationCase({
        ...VALID_CREDIT_NOTE,
        line_items: [line],
      });
      assertEquals(result.status, 422);
      assertEquals(result.body.code, "CREDIT_NOTE_LINE_EXCEEDS_SOURCE");
      assertEquals(result.facturapiPostCount, 0);
    }
  },
);

Deno.test(
  "handler: recalcula y rechaza subtotal, IVA y total divergentes",
  async () => {
    const result = await runSourceValidationCase({
      ...VALID_CREDIT_NOTE,
      subtotal: 101,
      tax_amount: 16.16,
      total: 117.16,
    });

    assertEquals(result.status, 422);
    assertEquals(result.body.code, "CREDIT_NOTE_TOTALS_MISMATCH");
    assertEquals(result.body.recreate_required, true);
    assertEquals(result.facturapiPostCount, 0);
  },
);

Deno.test(
  "handler: usa el snapshot devuelto por el claim atómico",
  async () => {
    const claimedSnapshot = {
      ...VALID_CREDIT_NOTE,
      cfdi_status: "stamping",
      line_items: [{ quantity: 1, unit_price: 100, source_line_index: 99 }],
    };
    const { deps } = makeDeps({
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          credit_notes: { data: VALID_CREDIT_NOTE, error: null },
          invoices: { data: STAMPED_INVOICE, error: null },
        },
        rpcs: {
          claim_credit_note_for_stamping: {
            data: claimedSnapshot,
            error: null,
          },
        },
        updates: { credit_notes: { data: null, error: null } },
      },
    });

    const res = await handleStampCreditNote(
      makeRequest({ credit_note_id: NC_ID }),
      deps,
    );
    const body = (await res.json()) as Record<string, unknown>;
    assertEquals(res.status, 422);
    assertEquals(body.code, "INVALID_SOURCE_LINE_INDEX");
  },
);

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
    const ncData = { ...VALID_CREDIT_NOTE };
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          credit_notes: { data: ncData, error: null },
          invoices: { data: STAMPED_INVOICE, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        selectsSeq: {
          // 1er select: NC principal (.single). 2do: siblings BL-08 (array).
          credit_notes: [
            { data: ncData, error: null },
            { data: [], error: null },
          ],
        },
        updatesSeq: {
          // Claim atómico exitoso (línea 96-103 del handler).
          credit_notes: [{ data: { id: NC_ID }, error: null }],
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

    const stamped = serviceState.updates.find(
      (u) => u.table === "credit_notes" && u.patch.cfdi_status === "stamped",
    );
    assert(stamped, "expected stamped update on credit_notes");
    assertEquals(stamped!.patch.facturapi_invoice_id, "fapi_nc_1");
    assertEquals(mock.calls.filter((c) => c.method === "POST").length, 1);
  } finally {
    mock.restore();
  }
});

Deno.test(
  "handler: Facturapi 400 returns 502 and marks credit note as error",
  async () => {
    const mock = installFacturapiMock({
      "/invoices": () => facturapiBadRequest("Invalid"),
    });
    try {
      const ncData = { ...VALID_CREDIT_NOTE };
      const { deps, serviceState } = makeDeps({
        env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
        service: {
          selects: {
            user_roles: { data: [{ role: "admin" }], error: null },
            credit_notes: { data: ncData, error: null },
            invoices: { data: STAMPED_INVOICE, error: null },
            company_settings: { data: { facturapi_mode: "test" }, error: null },
            billing_secrets: { data: null, error: null },
          },
          selectsSeq: {
            credit_notes: [
              { data: ncData, error: null },
              { data: [], error: null },
            ],
          },
          updatesSeq: {
            credit_notes: [{ data: { id: NC_ID }, error: null }],
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
  },
);

Deno.test(
  "handler: stub mode (no API key) returns stub:true UUID",
  async () => {
    const ncData = { ...VALID_CREDIT_NOTE };
    const { deps, serviceState } = makeDeps({
      env: {},
      service: {
        selects: {
          user_roles: { data: [{ role: "administrativo" }], error: null },
          credit_notes: { data: ncData, error: null },
          invoices: { data: STAMPED_INVOICE, error: null },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        selectsSeq: {
          credit_notes: [
            { data: ncData, error: null },
            { data: [], error: null },
          ],
        },
        updatesSeq: {
          credit_notes: [{ data: { id: NC_ID }, error: null }],
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
  },
);

// FIX-12 (M24): la NC debe propagar el descuento de línea al payload de
// Facturapi, igual que stamp-cfdi (BL-02), para no acreditar el bruto.
Deno.test(
  "handler: propaga discount al item de Facturapi cuando la línea trae descuento",
  async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const mock = installFacturapiMock({
      "/invoices": (req) => {
        if (req.method === "POST") {
          return req.json().then((b) => {
            capturedBody = b as Record<string, unknown>;
            return facturapiOk({ id: "fapi_nc_disc", uuid: "NC-UUID-DISC" });
          });
        }
        return new Response("not found", { status: 404 });
      },
      "/invoices/fapi_nc_disc/xml": () => xmlResponse("<xml/>"),
      "/invoices/fapi_nc_disc/pdf": () =>
        pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    });
    try {
      const ncData = {
        id: NC_ID,
        invoice_id: INVOICE_ID,
        tax_rate: 16,
        currency: "MXN",
        subtotal: 180,
        tax_amount: 28.8,
        total: 208.8,
        line_items: [
          {
            description: "IDENTIDAD MANIPULADA",
            quantity: 2,
            unit_price: 100,
            discount: 99,
            discount_type: "$",
            source_line_index: 0,
          },
        ],
      };
      const sourceInvoice = {
        ...STAMPED_INVOICE,
        subtotal: 180,
        tax_amount: 28.8,
        total: 208.8,
        line_items: [
          {
            description: "Servicio fuente con descuento",
            quantity: 2,
            unit_price: 100,
            discount: 10,
            discount_type: "%",
            clave_prod_serv: "78101803",
            clave_unidad: "E48",
            objeto_imp: "02",
          },
        ],
      };
      const { deps } = makeDeps({
        env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
        service: {
          selects: {
            user_roles: { data: [{ role: "admin" }], error: null },
            credit_notes: { data: ncData, error: null },
            invoices: { data: sourceInvoice, error: null },
            company_settings: { data: { facturapi_mode: "test" }, error: null },
            billing_secrets: { data: null, error: null },
          },
          selectsSeq: {
            credit_notes: [
              { data: ncData, error: null },
              { data: [], error: null },
            ],
          },
          updatesSeq: {
            credit_notes: [{ data: { id: NC_ID }, error: null }],
          },
          updates: { credit_notes: { data: null, error: null } },
        },
      });
      const res = await handleStampCreditNote(
        makeRequest({ credit_note_id: NC_ID }),
        deps,
      );
      await res.json();
      assertEquals(res.status, 200);
      const items = (
        capturedBody as { items?: Array<{ discount?: number }> } | null
      )?.items;
      // base 200, descuento 10% = 20
      assertEquals(items?.[0]?.discount, 20);
    } finally {
      mock.restore();
    }
  },
);

Deno.test(
  "handler: prorratea descuento fijo de una línea acreditada parcialmente",
  async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const mock = installFacturapiMock({
      "/invoices": (req) => {
        if (req.method === "POST") {
          return req.json().then((b) => {
            capturedBody = b as Record<string, unknown>;
            return facturapiOk({ id: "fapi_nc_fixed", uuid: "NC-UUID-FIXED" });
          });
        }
        return new Response("not found", { status: 404 });
      },
      "/invoices/fapi_nc_fixed/xml": () => xmlResponse("<xml/>"),
      "/invoices/fapi_nc_fixed/pdf": () =>
        pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    });
    try {
      const ncData = {
        id: NC_ID,
        invoice_id: INVOICE_ID,
        tax_rate: 16,
        currency: "MXN",
        subtotal: 450,
        tax_amount: 72,
        total: 522,
        line_items: [
          {
            description: "NC parcial",
            quantity: 5,
            unit_price: 100,
            discount: 50,
            discount_type: "$",
            source_line_index: 0,
          },
        ],
      };
      const sourceInvoice = {
        ...STAMPED_INVOICE,
        total: 1_044,
        line_items: [
          {
            description: "Renta",
            quantity: 10,
            unit_price: 100,
            discount: 100,
            discount_type: "$",
          },
        ],
      };
      const { deps } = makeDeps({
        env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
        service: {
          selects: {
            user_roles: { data: [{ role: "admin" }], error: null },
            credit_notes: { data: ncData, error: null },
            invoices: { data: sourceInvoice, error: null },
            company_settings: { data: { facturapi_mode: "test" }, error: null },
            billing_secrets: { data: null, error: null },
          },
          selectsSeq: {
            credit_notes: [
              { data: ncData, error: null },
              { data: [], error: null },
            ],
          },
          updatesSeq: {
            credit_notes: [{ data: { id: NC_ID }, error: null }],
          },
          updates: { credit_notes: { data: null, error: null } },
        },
      });

      const res = await handleStampCreditNote(
        makeRequest({ credit_note_id: NC_ID }),
        deps,
      );
      await res.json();

      assertEquals(res.status, 200);
      const items = (
        capturedBody as { items?: Array<{ discount?: number }> } | null
      )?.items;
      // 5/10 de la línea: descuento fijo acreditable = 100 × 500/1000 = 50.
      assertEquals(items?.[0]?.discount, 50);
    } finally {
      mock.restore();
    }
  },
);

// A1-B3: la NC debe respetar ObjetoImp y la tasa por línea de la factura
// origen. Antes aplicaba la tasa global a TODA línea → acreditaba IVA de más.
Deno.test(
  "handler: respeta objeto_imp 01 y tax_rate por línea en el payload",
  async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const mock = installFacturapiMock({
      "/invoices": (req) => {
        if (req.method === "POST") {
          return req.json().then((b) => {
            capturedBody = b as Record<string, unknown>;
            return facturapiOk({ id: "fapi_nc_tax", uuid: "NC-UUID-TAX" });
          });
        }
        return new Response("not found", { status: 404 });
      },
      "/invoices/fapi_nc_tax/xml": () => xmlResponse("<xml/>"),
      "/invoices/fapi_nc_tax/pdf": () =>
        pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    });
    try {
      const ncData = {
        id: NC_ID,
        invoice_id: INVOICE_ID,
        tax_rate: 16,
        currency: "MXN",
        subtotal: 300,
        tax_amount: 24,
        total: 324,
        line_items: [
          {
            description: "Descripción manipulada",
            quantity: 1,
            unit_price: 100,
            objeto_imp: "02",
            tax_rate: 99,
            source_line_index: 0,
          },
          {
            description: "Otra descripción manipulada",
            quantity: 1,
            unit_price: 100,
            tax_rate: 0,
            source_line_index: 1,
          },
          {
            description: "Default manipulado",
            quantity: 1,
            unit_price: 100,
            clave_prod_serv: "00000000",
            clave_unidad: "ZZZ",
            source_line_index: 2,
          },
        ],
      };
      const sourceInvoice = {
        ...STAMPED_INVOICE,
        subtotal: 300,
        tax_amount: 24,
        total: 324,
        line_items: [
          {
            description: "No objeto fuente",
            quantity: 1,
            unit_price: 100,
            objeto_imp: "01",
            clave_prod_serv: "84111506",
            clave_unidad: "ACT",
          },
          {
            description: "Tasa 8 fuente",
            quantity: 1,
            unit_price: 100,
            objeto_imp: "02",
            tax_rate: 8,
            clave_prod_serv: "78101803",
            clave_unidad: "E48",
          },
          {
            description: "Default fuente",
            quantity: 1,
            unit_price: 100,
            objeto_imp: "02",
            clave_prod_serv: "78101800",
            clave_unidad: "DAY",
          },
        ],
      };
      const { deps } = makeDeps({
        env: { FACTURAPI_TEST_KEY: "sk_test_xxx" },
        service: {
          selects: {
            user_roles: { data: [{ role: "admin" }], error: null },
            credit_notes: { data: ncData, error: null },
            invoices: { data: sourceInvoice, error: null },
            company_settings: { data: { facturapi_mode: "test" }, error: null },
            billing_secrets: { data: null, error: null },
          },
          selectsSeq: {
            credit_notes: [
              { data: ncData, error: null },
              { data: [], error: null },
            ],
          },
          updatesSeq: {
            credit_notes: [{ data: { id: NC_ID }, error: null }],
          },
          updates: { credit_notes: { data: null, error: null } },
        },
      });
      const res = await handleStampCreditNote(
        makeRequest({ credit_note_id: NC_ID }),
        deps,
      );
      await res.json();
      assertEquals(res.status, 200);
      const items = (
        capturedBody as {
          items?: Array<{
            product?: {
              description?: string;
              product_key?: string;
              unit_key?: string;
              taxes?: Array<{ rate?: number }>;
            };
          }>;
        } | null
      )?.items;
      assertEquals(items?.[0]?.product?.taxes?.length, 0);
      assertEquals(items?.[1]?.product?.taxes?.[0]?.rate, 0.08);
      assertEquals(items?.[2]?.product?.taxes?.[0]?.rate, 0.16);
      assertEquals(items?.[0]?.product?.description, "No objeto fuente");
      assertEquals(items?.[0]?.product?.product_key, "84111506");
      assertEquals(items?.[0]?.product?.unit_key, "ACT");
      assertEquals(items?.[2]?.product?.product_key, "78101800");
      assertEquals(items?.[2]?.product?.unit_key, "DAY");
    } finally {
      mock.restore();
    }
  },
);
