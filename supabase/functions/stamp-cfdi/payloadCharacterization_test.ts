import { validationCases } from "./test/invoiceValidationCases.ts";
import { createInvoiceGateway } from "./invoiceGateway.ts";
// Captured against the original handler before extracting the pure mapper.
// JSON snapshots describe the wire payload; undefined properties are omitted.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSupabaseMock } from "../_shared/test/supabaseClientMock.ts";
import { installFacturapiMock } from "../_shared/test/facturapiMock.ts";
import { handleStampCfdi } from "./handler.ts";
import snapshots from "./test/invoicePayload.snapshots.json" with {
  type: "json",
};

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

function fixture(invoice: Record<string, unknown>) {
  const caller = buildSupabaseMock({ claims: { sub: USER_ID } });
  const service = buildSupabaseMock({
    selects: {
      profiles: { data: { is_active: true }, error: null },
      user_roles: { data: [{ role: "admin" }], error: null },
      organization_memberships: {
        data: [{ organization_id: ORG_ID, member_type: "internal" }],
        error: null,
      },
      organizations: { data: [{ id: ORG_ID, is_active: true }], error: null },
      invoices: {
        data: { id: INVOICE_ID, organization_id: ORG_ID, ...invoice },
        error: null,
      },
      company_settings: { data: { facturapi_mode: "test" }, error: null },
      billing_secrets: { data: null, error: null },
    },
    updatesSeq: { invoices: [{ data: { id: INVOICE_ID }, error: null }] },
  });
  return {
    service,
    request: new Request("https://example.invalid/stamp-cfdi", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-token" },
      body: JSON.stringify({ invoice_id: INVOICE_ID }),
    }),
    deps: {
      createCallerClient: () => caller.client,
      createServiceClient: () => service.client,
      createInvoiceGateway,
      env: (key: string) =>
        key === "FACTURAPI_TEST_KEY" ? "sk_test_fixture_only" : undefined,
    },
  };
}

for (const snapshot of snapshots) {
  Deno.test(`invoice payload baseline: ${snapshot.name}`, async () => {
    const pac = installFacturapiMock({
      "/invoices": () =>
        Response.json({ id: "pending-fixture", status: "pending" }, {
          status: 202,
        }),
    });
    try {
      const { request, deps, service } = fixture(snapshot.invoice);
      const response = await handleStampCfdi(request, deps);
      assertEquals(response.status, 202);
      assertEquals(pac.calls.length, 1);
      assertEquals(JSON.parse(pac.calls[0].body!), snapshot.expected);
      assertEquals(service.updates.map((update) => update.patch.cfdi_status), [
        "stamping",
        "stamping",
      ]);
    } finally {
      pac.restore();
    }
  });
}

for (const scenario of validationCases) {
  Deno.test(`invoice validation baseline: ${scenario.name}`, async () => {
    const pac = installFacturapiMock({});
    try {
      const { request, deps, service } = fixture(scenario.invoice);
      const response = await handleStampCfdi(request, deps);
      assertEquals(response.status, scenario.status);
      assertEquals(await response.json(), { error: scenario.error });
      assertEquals(pac.calls, []);
      assertEquals(service.updates.map((update) => update.patch), [
        { cfdi_status: "stamping" },
        {
          cfdi_status: "error",
          cfdi_error_message: scenario.release ?? scenario.error,
        },
      ]);
    } finally {
      pac.restore();
    }
  });
}
