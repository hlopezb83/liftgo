// Unit tests for cancel-credit-note pure handler.
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CancelCreditNoteDeps,
  handleCancelCreditNote,
} from "./handler.ts";
import {
  buildSupabaseMock,
  type MockConfig,
} from "../_shared/test/supabaseClientMock.ts";
import {
  facturapiOk,
  installFacturapiMock,
} from "../_shared/test/facturapiMock.ts";

const NC_ID = "11111111-1111-4111-8111-111111111111";
const SUB_UUID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG_ID = "55555555-5555-4555-8555-555555555555";

function makeRequest(
  body: unknown,
  opts: { auth?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": "http://localhost:8080",
  };
  if (opts.auth !== null) headers["Authorization"] = opts.auth ?? "Bearer t";
  return new Request("https://example.com/cancel-credit-note", {
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
  const service = buildSupabaseMock({
    ...(opts.service ?? {}),
    selects: {
      // M-1: authenticateWithDeps ahora verifica profiles.is_active — default
      // cuenta activa para no repetir el mock en cada test.
      profiles: { data: { is_active: true }, error: null },
      organization_memberships: {
        data: [{ organization_id: ORG_ID, member_type: "internal" }],
        error: null,
      },
      organizations: { data: [{ id: ORG_ID }], error: null },
      ...(opts.service?.selects ?? {}),
    },
  });
  const env = opts.env ?? {};
  const deps: CancelCreditNoteDeps = {
    createCallerClient: () => caller.client,
    createServiceClient: () => service.client,
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
    env: (k) => env[k],
  };
  return { deps, serviceState: service };
}

Deno.test("cancel-credit-note: 401 sin Authorization", async () => {
  const { deps } = makeDeps({});
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }, { auth: null }),
    deps,
  );
  assertEquals(res.status, 401);
});

Deno.test("cancel-credit-note: 403 si el rol no es admin/administrativo", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "ventas" }], error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }),
    deps,
  );
  assertEquals(res.status, 403);
});

Deno.test("cancel-credit-note: 400 si credit_note_id no es UUID", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: "x", motive: "02" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-credit-note: 400 si motivo no está en 01-04", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "99" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-credit-note: 400 motivo 01 sin substitution_uuid", async () => {
  const { deps } = makeDeps({
    service: {
      selects: { user_roles: { data: [{ role: "admin" }], error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "01" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-credit-note: 404 si la nota de crédito no existe", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        credit_notes: { data: null, error: null },
      },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }),
    deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("cancel-credit-note: 400 si la NC no está timbrada", async () => {
  const { deps } = makeDeps({
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        credit_notes: {
          data: {
            organization_id: ORG_ID,
            cfdi_status: "draft",
            facturapi_invoice_id: null,
          },
          error: null,
        },
      },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test("cancel-credit-note: stub (sin apiKey en modo test) marca aceptada y actualiza", async () => {
  const { deps, serviceState } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "administrativo" }], error: null },
        credit_notes: {
          data: {
            organization_id: ORG_ID,
            cfdi_status: "stamped",
            facturapi_invoice_id: null,
          },
          error: null,
        },
        company_settings: {
          data: { facturapi_mode: "test", organization_id: ORG_ID },
          error: null,
        },
        billing_secrets: { data: null, error: null },
      },
      updates: { credit_notes: { data: null, error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.stub, true);
  assertEquals(body.accepted, true);
  const upd = serviceState.updates.find((u) => u.table === "credit_notes");
  assert(upd, "expected a credit note update");
  assertEquals(upd!.patch.cfdi_status, "cancelled");
});

Deno.test("cancel-credit-note: happy path llama a Facturapi DELETE y acepta", async () => {
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
          credit_notes: {
            data: {
              organization_id: ORG_ID,
              cfdi_status: "stamped",
              facturapi_invoice_id: "fapi_xyz",
            },
            error: null,
          },
          company_settings: {
            data: { facturapi_mode: "test", organization_id: ORG_ID },
            error: null,
          },
          billing_secrets: { data: null, error: null },
        },
        updates: { credit_notes: { data: null, error: null } },
      },
    });
    const res = await handleCancelCreditNote(
      makeRequest({
        credit_note_id: NC_ID,
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
    const upd = serviceState.updates.find((u) => u.table === "credit_notes");
    assertEquals(upd!.patch.substitution_uuid, SUB_UUID);
  } finally {
    mock.restore();
  }
});

Deno.test("cancel-credit-note: Facturapi 500 devuelve 502", async () => {
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
          credit_notes: {
            data: {
              organization_id: ORG_ID,
              cfdi_status: "stamped",
              facturapi_invoice_id: "fapi_e",
            },
            error: null,
          },
          company_settings: {
            data: { facturapi_mode: "test", organization_id: ORG_ID },
            error: null,
          },
          billing_secrets: { data: null, error: null },
        },
      },
    });
    const res = await handleCancelCreditNote(
      makeRequest({ credit_note_id: NC_ID, motive: "02" }),
      deps,
    );
    await res.text();
    assertEquals(res.status, 502);
  } finally {
    mock.restore();
  }
});

Deno.test("cancel-credit-note: en modo live sin apiKey rechaza cancelación stub", async () => {
  const { deps, serviceState } = makeDeps({
    env: {},
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        credit_notes: {
          data: {
            organization_id: ORG_ID,
            cfdi_status: "stamped",
            facturapi_invoice_id: "fapi_z",
          },
          error: null,
        },
        company_settings: {
          data: { facturapi_mode: "live", organization_id: ORG_ID },
          error: null,
        },
        billing_secrets: { data: null, error: null },
      },
      updates: { credit_notes: { data: null, error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 400);
  assert(String(body.error).includes("API key no configurada"));
  const upd = serviceState.updates.find((u) =>
    u.table === "credit_notes" && u.patch.cfdi_status !== undefined
  );
  assertEquals(upd, undefined);
});

// EC-A1: bypass service_role para el consumer de cfdi_retry_queue.
Deno.test("cancel-credit-note: service_role JWT salta la verificación de rol", async () => {
  const { deps, serviceState } = makeDeps({
    callerClaims: { role: "service_role" },
    env: {},
    service: {
      selects: {
        credit_notes: {
          data: {
            organization_id: ORG_ID,
            cfdi_status: "stamped",
            facturapi_invoice_id: null,
          },
          error: null,
        },
        company_settings: {
          data: { facturapi_mode: "test", organization_id: ORG_ID },
          error: null,
        },
        billing_secrets: { data: null, error: null },
      },
      updates: { credit_notes: { data: null, error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.stub, true);
  const upd = serviceState.updates.find((u) => u.table === "credit_notes");
  assert(upd, "expected an update via service_role bypass");
});

// ────────────────────────────────────────────────────────────────────────────
// Multiempresa · Fase 1 — regresión de aislamiento fiscal
// ────────────────────────────────────────────────────────────────────────────

Deno.test("cancel-credit-note: MULTIEMPRESA rechaza NC de otra organización (403) sin claim ni PAC", async () => {
  let facturapiCalled = 0;
  const mock = installFacturapiMock({
    "/invoices/fapi_other": () => {
      facturapiCalled++;
      return facturapiOk({ cancellation_status: "accepted" });
    },
  });
  try {
    const { deps, serviceState } = makeDeps({
      env: { FACTURAPI_TEST_KEY: "sk_test" },
      service: {
        selects: {
          user_roles: { data: [{ role: "admin" }], error: null },
          credit_notes: {
            data: {
              cfdi_status: "stamped",
              facturapi_invoice_id: "fapi_other",
              organization_id: OTHER_ORG_ID,
            },
            error: null,
          },
        },
      },
    });
    const res = await handleCancelCreditNote(
      makeRequest({ credit_note_id: NC_ID, motive: "02" }),
      deps,
    );
    const body = await res.json();
    assertEquals(res.status, 403);
    assertEquals(body.error, "El documento pertenece a otra empresa.");
    assertEquals(serviceState.updates.length, 0, "no debe tocarse la NC");
    assertEquals(facturapiCalled, 0, "el PAC nunca debe invocarse");
  } finally {
    mock.restore();
  }
});

Deno.test("cancel-credit-note: MULTIEMPRESA sin credenciales propias en modo live rechaza (no reutiliza llaves ajenas)", async () => {
  const { deps, serviceState } = makeDeps({
    env: { FACTURAPI_LIVE_KEY: "sk_live_ajena" },
    service: {
      selects: {
        user_roles: { data: [{ role: "admin" }], error: null },
        credit_notes: {
          data: {
            cfdi_status: "stamped",
            facturapi_invoice_id: "fapi_z2",
            organization_id: ORG_ID,
          },
          error: null,
        },
        company_settings: {
          data: { facturapi_mode: "live", organization_id: ORG_ID },
          error: null,
        },
        billing_secrets: { data: null, error: null },
        organizations: {
          data: [{ id: ORG_ID }, { id: OTHER_ORG_ID }],
          error: null,
        },
      },
      updates: { credit_notes: { data: null, error: null } },
    },
  });
  const res = await handleCancelCreditNote(
    makeRequest({ credit_note_id: NC_ID, motive: "02" }),
    deps,
  );
  const body = await res.json();
  assertEquals(res.status, 400);
  assert(String(body.error).includes("API key no configurada"));
  const upd = serviceState.updates.find((u) =>
    u.table === "credit_notes" && u.patch.cfdi_status !== undefined
  );
  assertEquals(upd, undefined, "no debe marcarse cancelada sin key propia");
});
