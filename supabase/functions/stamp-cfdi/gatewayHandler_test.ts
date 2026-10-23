// Handler orchestration with a fake PAC gateway. Fetch is forbidden, not mocked
// to return success: accidentally bypassing the injected gateway fails the test.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSupabaseMock,
  type MockConfig,
} from "../_shared/test/supabaseClientMock.ts";
import { handleStampCfdi } from "./handler.ts";
import type { InvoiceGateway } from "./invoiceGateway.ts";
import snapshots from "./test/invoicePayload.snapshots.json" with {
  type: "json",
};

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const UUID = "55555555-5555-4555-8555-555555555555";
const issued = { id: "remote-fixture", uuid: UUID, total: 1160 };
const unused = () => {
  throw new Error("Unexpected PAC operation");
};
const pendingGateway: InvoiceGateway = {
  create: () => Promise.resolve({ id: "remote-pending", status: "pending" }),
  downloadXml: unused,
  downloadPdf: unused,
};

function fixture(
  options: { invoice?: Record<string, unknown>; service?: MockConfig } = {},
) {
  const caller = buildSupabaseMock({ claims: { sub: USER_ID } });
  const service = buildSupabaseMock({
    ...options.service,
    selects: {
      profiles: { data: { is_active: true }, error: null },
      user_roles: { data: [{ role: "admin" }], error: null },
      organization_memberships: {
        data: [{ organization_id: ORG_ID, member_type: "internal" }],
        error: null,
      },
      organizations: { data: [{ id: ORG_ID, is_active: true }], error: null },
      invoices: {
        data: {
          id: INVOICE_ID,
          organization_id: ORG_ID,
          total: 1160,
          receptor_rfc: "AAA010101AA1",
          receptor_regimen_fiscal: "601",
          receptor_domicilio_fiscal_cp: "64000",
          ...options.invoice,
        },
        error: null,
      },
      company_settings: { data: { facturapi_mode: "test" }, error: null },
      billing_secrets: { data: null, error: null },
      ...options.service?.selects,
    },
    updatesSeq: options.service?.updatesSeq ??
      { invoices: [{ data: { id: INVOICE_ID }, error: null }] },
  });
  return {
    service,
    request: () =>
      new Request("https://example.invalid/stamp-cfdi", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic-token" },
        body: JSON.stringify({ invoice_id: INVOICE_ID }),
      }),
    deps: {
      createCallerClient: () => caller.client,
      createServiceClient: () => service.client,
      createInvoiceGateway: (_key: string): InvoiceGateway => pendingGateway,
      env: (key: string) =>
        key === "FACTURAPI_TEST_KEY" ? "sk_test_fixture_only" : undefined,
    },
  };
}

function offlineTest(name: string, run: () => Promise<void>) {
  Deno.test(`gateway handler: ${name}`, async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = () => {
      fetchCalls++;
      throw new Error("Network forbidden");
    };
    try {
      await run();
      assertEquals(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

for (const snapshot of snapshots) {
  offlineTest(
    `wire snapshot without global fetch: ${snapshot.name}`,
    async () => {
      // Clear fixture defaults when the snapshot intentionally has no receptor.
      const f = fixture({
        invoice: {
          receptor_rfc: undefined,
          receptor_regimen_fiscal: undefined,
          receptor_domicilio_fiscal_cp: undefined,
          ...snapshot.invoice,
        },
      });
      let creates = 0;
      f.deps.createInvoiceGateway = () => ({
        ...pendingGateway,
        create: (payload, { signal }) => {
          creates++;
          assertEquals(JSON.parse(JSON.stringify(payload)), snapshot.expected);
          assertEquals(signal.aborted, false);
          return pendingGateway.create(payload, { signal });
        },
      });
      const response = await handleStampCfdi(f.request(), f.deps);
      assertEquals(response.status, 202);
      assertEquals(creates, 1);
    },
  );
}

offlineTest(
  "auth, tenant, failed claim and idempotency all precede gateway construction",
  async () => {
    for (
      const scenario of [
        { status: 401, auth: false },
        {
          status: 403,
          invoice: { organization_id: "44444444-4444-4444-8444-444444444444" },
        },
        {
          status: 409,
          service: { updatesSeq: { invoices: [{ data: null, error: null }] } },
        },
        { status: 409, invoice: { cfdi_status: "stamped", cfdi_uuid: UUID } },
        { status: 409, invoice: { facturapi_invoice_id: "remote-existing" } },
        { status: 422, invoice: { tax_rate: 11 } },
      ]
    ) {
      const f = fixture(scenario);
      f.deps.createInvoiceGateway = unused;
      const request = f.request();
      if (scenario.auth === false) request.headers.delete("Authorization");
      assertEquals(
        (await handleStampCfdi(request, f.deps)).status,
        scenario.status,
      );
      assertEquals(f.service.uploads, []);
    }
  },
);

offlineTest(
  "two concurrent requests have one claimed winner and one create",
  async () => {
    const f = fixture({
      service: {
        updatesSeq: {
          invoices: [
            { data: { id: INVOICE_ID }, error: null },
            { data: null, error: null },
          ],
        },
      },
    });
    let creates = 0;
    f.deps.createInvoiceGateway = () => ({
      ...pendingGateway,
      create: () => {
        creates++;
        return Promise.resolve({ id: "remote-pending", status: "pending" });
      },
    });
    const results = await Promise.all([
      handleStampCfdi(f.request(), f.deps),
      handleStampCfdi(f.request(), f.deps),
    ]);
    assertEquals(results.map((r) => r.status).sort(), [202, 409]);
    assertEquals(creates, 1);
    assertEquals(f.service.updates[0].filters, [
      { col: "id", val: INVOICE_ID },
      { col: "cfdi_status", val: ["pending", "error"] },
      { col: "cfdi_uuid", val: null },
    ]);
    assertEquals(
      f.service.updates.at(-1)?.patch.facturapi_invoice_id,
      "remote-pending",
    );
    assertEquals(f.service.inserts, []);
  },
);

offlineTest(
  "creation, identity persistence, XML, PDF and final save retain order",
  async () => {
    const f = fixture({
      invoice: { invoice_number: "BORRADOR-X", status: "draft" },
    });
    const order: string[] = [];
    f.deps.createInvoiceGateway = () => {
      assertEquals(f.service.updates.map((u) => u.patch), [{
        cfdi_status: "stamping",
      }]);
      order.push("gateway");
      const assertIdentitySaved = (id: string) => {
        assertEquals(id, issued.id);
        assertEquals(f.service.updates[1].patch, {
          facturapi_invoice_id: issued.id,
          cfdi_uuid: UUID,
          facturapi_env: "test",
        });
        assertEquals(f.service.updates.length, 2);
      };
      return {
        create: () => {
          order.push("create");
          return Promise.resolve({ ...issued, series: "A", folio_number: 7 });
        },
        downloadXml: (id) => {
          assertIdentitySaved(id);
          order.push("xml");
          return Promise.resolve("<xml/>");
        },
        downloadPdf: (id) => {
          assertIdentitySaved(id);
          assertEquals(f.service.uploads.length, 1);
          order.push("pdf");
          return Promise.resolve(new Uint8Array([37, 80, 68, 70]));
        },
      };
    };
    const response = await handleStampCfdi(f.request(), f.deps);
    assertEquals(response.status, 200);
    assertEquals(order, ["gateway", "create", "xml", "pdf"]);
    assertEquals(f.service.updates[2].patch.cfdi_status, "stamped");
    assertEquals(f.service.updates[2].patch.status, "sent");
    assertEquals(f.service.updates[2].patch.folio, "7");
    assertEquals(f.service.rpcCalls[0].fn, "assign_stamped_invoice_number");
    assertEquals(f.service.uploads.map((u) => u.path), [
      `${ORG_ID}/${INVOICE_ID}/${UUID}.xml`,
      `${ORG_ID}/${INVOICE_ID}/${UUID}.pdf`,
    ]);
  },
);

offlineTest(
  "hard timeout aborts the gateway signal without releasing claim or enqueueing",
  async () => {
    const f = fixture();
    const originalTimeout = globalThis.setTimeout;
    let stampSignal: AbortSignal | undefined;
    globalThis.setTimeout = ((
      handler: () => void,
      delay?: number,
    ) => {
      if (delay === 30_000 && typeof handler === "function") {
        queueMicrotask(() => handler());
        return 0;
      }
      return originalTimeout(handler, delay);
    }) as typeof setTimeout;
    f.deps.createInvoiceGateway = () => ({
      ...pendingGateway,
      create: (_payload, { signal }) => {
        stampSignal = signal;
        // PAC outcome remains unknown even after abort. Only the handler timeout resolves.
        return new Promise(() => {});
      },
    });
    try {
      const response = await handleStampCfdi(f.request(), f.deps);
      assertEquals(response.status, 504);
      assertEquals((await response.json()).code, "TIMEOUT");
      assertEquals(stampSignal?.aborted, true);
      assertEquals(f.service.updates.map((u) => u.patch), [{
        cfdi_status: "stamping",
      }]);
      assertEquals(f.service.inserts, []);
    } finally {
      globalThis.setTimeout = originalTimeout;
    }
  },
);

for (
  const failure of ["storage", "download", "final-db", "variance"] as const
) {
  offlineTest(
    `${failure} preserves already issued identity and does not release the claim`,
    async () => {
      const f = fixture({
        service: {
          storage: failure === "storage"
            ? { "cfdi-files": { error: { message: "synthetic failure" } } }
            : {},
          updatesSeq: {
            invoices: [
              { data: { id: INVOICE_ID }, error: null },
              { data: null, error: null },
              {
                data: null,
                error: failure === "final-db"
                  ? { message: "synthetic failure" }
                  : null,
              },
            ],
          },
        },
      });
      f.deps.createInvoiceGateway = () => ({
        create: () =>
          Promise.resolve({
            ...issued,
            total: failure === "variance" ? 1200 : 1160,
          }),
        downloadXml: () =>
          failure === "download"
            ? Promise.reject(new Error("synthetic failure"))
            : Promise.resolve("<xml/>"),
        downloadPdf: () => Promise.resolve(new Uint8Array([37, 80, 68, 70])),
      });
      const response = await handleStampCfdi(f.request(), f.deps);
      assertEquals(
        response.status,
        failure === "final-db" ? 500 : failure === "variance" ? 502 : 200,
      );
      assertEquals(f.service.updates[1].patch.cfdi_uuid, UUID);
      assertEquals(f.service.updates[2].patch.cfdi_uuid, UUID);
      assertEquals(f.service.updates[2].patch.facturapi_invoice_id, issued.id);
      assertEquals(f.service.updates.length, 3);
      assertEquals(f.service.inserts, []);
      if (failure === "storage") {
        assertEquals(f.service.updates[2].patch.cfdi_xml_url, null);
        assertEquals(f.service.updates[2].patch.cfdi_pdf_url, null);
      }
      if (failure === "variance") {
        assertEquals(f.service.updates[2].patch.cfdi_status, "error");
      }
    },
  );
}

offlineTest(
  "unexpected failure after issuance never compensates the remote identity",
  async () => {
    const f = fixture();
    const from = f.service.client.from;
    f.service.client.from = (table) => {
      const query = from(table);
      const update = query.update;
      query.update = (patch) => {
        if (patch.cfdi_status === "stamped") {
          throw new Error("synthetic final update exception");
        }
        return update(patch);
      };
      return query;
    };
    f.deps.createInvoiceGateway = () => ({
      create: () => Promise.resolve(issued),
      downloadXml: () => Promise.resolve("<xml/>"),
      downloadPdf: () => Promise.resolve(new Uint8Array()),
    });
    assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 500);
    assertEquals(f.service.updates.length, 2);
    assertEquals(f.service.updates[1].patch.cfdi_uuid, UUID);
  },
);

offlineTest(
  "configuration errors cannot instantiate the gateway or degrade to stub",
  async () => {
    const f = fixture({
      service: {
        selects: {
          company_settings: {
            data: null,
            error: { message: "synthetic config failure" },
          },
        },
      },
    });
    f.deps.createInvoiceGateway = unused;
    const response = await handleStampCfdi(f.request(), f.deps);
    assertEquals(response.status, 503);
    assertEquals((await response.json()).cfdi_uuid, undefined);
    assertEquals(f.service.updates.at(-1)?.patch.cfdi_status, "error");
  },
);

offlineTest(
  "unexpected failure before issuance still compensates the claim",
  async () => {
    const f = fixture();
    f.deps.createInvoiceGateway = unused;
    assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 500);
    assertEquals(f.service.updates.at(-1)?.patch, {
      cfdi_status: "error",
      cfdi_error_message: "Internal error during stamping",
    });
    assertEquals(f.service.uploads, []);
  },
);
