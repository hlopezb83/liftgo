// Unit tests for stamp-cfdi pure handler (no network, no Supabase).
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeStampVariance,
  handleStampCfdi,
  type StampCfdiDeps,
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

Deno.test("handler: returns 409 when invoice already stamped (idempotencia)", async () => {
  // Guard de idempotencia: bloquea re-timbrado para evitar generar un segundo
  // CFDI en el SAT con UUID distinto. Antes de v6.66.19 esto era un bug activo.
  const mock = installFacturapiMock({
    "/invoices": () => {
      throw new Error("Facturapi should NOT be called when already stamped");
    },
  });
  try {
    const { deps, serviceState } = makeDeps({
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          invoices: {
            data: {
              id: INVOICE_ID,
              cfdi_status: "stamped",
              cfdi_uuid: "EXISTING-UUID-1234",
              total: 1160,
            },
            error: null,
          },
        },
      },
    });
    const res = await handleStampCfdi(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 409);
    assertEquals(body.cfdi_uuid, "EXISTING-UUID-1234");
    // No debe haber ningún update — la factura permanece intacta.
    assertEquals(serviceState.updates.length, 0);
    // Facturapi no fue invocado.
    assertEquals(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
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
              receptor_rfc: "AAA010101AAA",
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
              receptor_rfc: "AAA010101AAA",
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

Deno.test("computeStampVariance: null cuando falta algún total", () => {
  assertEquals(computeStampVariance(null, 1160), null);
  assertEquals(computeStampVariance(1160, undefined), null);
  assertEquals(computeStampVariance(1160, "abc"), null);
  assertEquals(computeStampVariance(1160, Number.NaN), null);
});

Deno.test("computeStampVariance: tolerancia de 1 centavo", () => {
  const ok = computeStampVariance(1160, 1160);
  assertEquals(ok, { variance: 0, withinTolerance: true });

  const within = computeStampVariance(1160, 1160.01);
  assertEquals(within, { variance: 0.01, withinTolerance: true });

  const beyond = computeStampVariance(1160, 1160.02);
  assertEquals(beyond, { variance: 0.02, withinTolerance: false });

  const negative = computeStampVariance(1160, 1159.5);
  assertEquals(negative, { variance: -0.5, withinTolerance: false });
});

Deno.test("handler: BL-A5 registra varianza sin romper el flujo stamped", async () => {
  const mock = installFacturapiMock({
    "/invoices": (req) => {
      if (req.method === "POST") {
        // Facturapi timbró con un total distinto al local (redondeo de descuentos).
        return facturapiOk({
          id: "fapi_var",
          uuid: "CFDI-UUID-VAR",
          total: 1160.49,
        });
      }
      return new Response("not found", { status: 404 });
    },
    "/invoices/fapi_var/xml": () => xmlResponse("<xml/>"),
    "/invoices/fapi_var/pdf": () =>
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
              receptor_rfc: "AAA010101AAA",
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
    // El flujo stamped NO se rompe por la varianza.
    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.cfdi_uuid, "CFDI-UUID-VAR");

    const stampUpdate = serviceState.updates.find((u) =>
      u.table === "invoices" && u.patch.cfdi_status === "stamped"
    );
    assert(stampUpdate, "expected a stamped update on invoices");
    // La varianza queda registrada y el warning va en cfdi_error_message.
    assertEquals(stampUpdate!.patch.stamp_variance, 0.49);
    assert(
      typeof stampUpdate!.patch.stamp_variance_checked_at === "string",
      "expected stamp_variance_checked_at to be populated",
    );
    assert(
      String(stampUpdate!.patch.cfdi_error_message).includes("BL-A5"),
      "expected a BL-A5 warning in cfdi_error_message",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("handler: BL-A5 totales iguales registran varianza cero sin warning", async () => {
  const mock = installFacturapiMock({
    "/invoices": (req) => {
      if (req.method === "POST") {
        return facturapiOk({
          id: "fapi_ok2",
          uuid: "CFDI-UUID-OK2",
          total: 1160,
        });
      }
      return new Response("not found", { status: 404 });
    },
    "/invoices/fapi_ok2/xml": () => xmlResponse("<xml/>"),
    "/invoices/fapi_ok2/pdf": () =>
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
              receptor_rfc: "AAA010101AAA",
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

    const stampUpdate = serviceState.updates.find((u) =>
      u.table === "invoices" && u.patch.cfdi_status === "stamped"
    );
    assert(stampUpdate, "expected a stamped update on invoices");
    assertEquals(stampUpdate!.patch.stamp_variance, 0);
    assertEquals(stampUpdate!.patch.cfdi_error_message, null);
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

// ────────────────────────────────────────────────────────────────────────────
// v7.222.0 — Auditoría de Tests Top-10 #6 + #8
// ────────────────────────────────────────────────────────────────────────────

Deno.test("handler: claim atómico — 2ª petición concurrente NO invoca al PAC (top-10 #6)", async () => {
  // Simulamos que el UPDATE ... WHERE cfdi_status IN ('pending','error') no
  // encontró filas (fila ya está en 'stamping' por la 1ª llamada). El handler
  // debe retornar 409 sin llamar a Facturapi.
  let facturapiCalled = 0;
  const mock = installFacturapiMock({
    "/invoices": () => {
      facturapiCalled++;
      return facturapiOk({ id: "should_not_happen", uuid: "SHOULD-NOT" });
    },
  });

  try {
    const { deps } = makeDeps({
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
              receptor_rfc: "AAA010101AAA",
            },
            error: null,
          },
        },
        // El claim UPDATE devuelve null (via updatesSeq FIFO) → concurrent
        // stamp in progress. Simula que otro worker ya movió cfdi_status a
        // 'stamping' entre nuestro SELECT inicial y el UPDATE atómico.
        updatesSeq: {
          invoices: [{ data: null, error: null }],
        },
        updates: { invoices: { data: null, error: null } },
      },
    });

    const res = await handleStampCfdi(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    await res.json();
    assertEquals(res.status, 409, "claim fallido debe retornar 409");
    assertEquals(facturapiCalled, 0, "PAC NUNCA debe invocarse si el claim falla");
  } finally {
    mock.restore();
  }
});

Deno.test("handler: timeout PAC deja factura en 'stamping' (top-10 #8 / EC-A2)", async () => {
  // Facturapi excede el timeout — fetch rechaza con AbortError. La factura
  // NO debe caer a 'error' (el CFDI puede haberse emitido server-side); el
  // handler devuelve 504 y el cron `reconcile-stamping-invoices` la resuelve.
  const mock = installFacturapiMock({
    "/invoices": () => {
      // Simula timeout del wrapper: el err lleva `code:"TIMEOUT"` que
      // describeFacturapiError propaga en la 2ª rama del isTimeout check.
      throw Object.assign(new Error("Facturapi request timed out"), {
        status: 504,
        code: "TIMEOUT",
      });
    },
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
              receptor_rfc: "AAA010101AAA",
            },
            error: null,
          },
          company_settings: { data: { facturapi_mode: "test" }, error: null },
          billing_secrets: { data: null, error: null },
        },
        // 1º update: claim atómico → devuelve id (claim exitoso).
        // 2º+ updates fallback: no importa; el handler debe salir por la rama
        //   timeout ANTES de tocar cfdi_status='error'.
        updatesSeq: {
          invoices: [{ data: { id: INVOICE_ID }, error: null }],
        },
        updates: { invoices: { data: null, error: null } },
      },
    });

    const res = await handleStampCfdi(
      makeRequest({ invoice_id: INVOICE_ID }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 504, "timeout debe devolver 504");
    assertEquals(body.code, "TIMEOUT");
    assertEquals(body.transient, true);

    // Verificación clave EC-A2: NO debe existir un update con cfdi_status='error'
    const errorUpdate = serviceState.updates.find((u) =>
      u.table === "invoices" && u.patch.cfdi_status === "error"
    );
    assert(
      !errorUpdate,
      "EC-A2 BREACH: la factura fue marcada 'error' en timeout — reconcile no la recuperará",
    );
    // Tampoco stamped
    const stampedUpdate = serviceState.updates.find((u) =>
      u.table === "invoices" && u.patch.cfdi_status === "stamped"
    );
    assert(!stampedUpdate, "no debe marcarse stamped en timeout");
  } finally {
    mock.restore();
  }
});
