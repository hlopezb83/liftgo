import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSupabaseMock,
  type TableResponse,
} from "../_shared/test/supabaseClientMock.ts";
import { handleStampCfdi } from "./handler.ts";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const orgId = "33333333-3333-4333-8333-333333333333";
const otherOrg = "44444444-4444-4444-8444-444444444444";
const quoteId = "55555555-5555-4555-8555-555555555555";
const sourceId = "66666666-6666-4666-8666-666666666666";
const explicit = {
  description: "Equipo",
  quantity: 1,
  unit_price: 1000,
  clave_prod_serv: "24101600",
  clave_unidad: "H87",
};
const saleLine = { ...explicit, line_kind: "sale" };
const quote = (id = quoteId, quote_type = "sale") => ({
  id,
  organization_id: orgId,
  quote_type,
});

function fixture(options: {
  invoice?: Record<string, unknown>;
  quotes?: TableResponse;
  quoteThrows?: boolean;
  stub?: boolean;
  configError?: boolean;
  active?: boolean;
  role?: string;
} = {}) {
  const reads = {
    quotes: [] as Array<Array<{ col: string; val: unknown }>>,
    config: 0,
    secrets: 0,
    gateway: 0,
    env: 0,
    payloads: [] as Record<string, unknown>[],
  };
  const caller = buildSupabaseMock({ claims: { sub: userId } });
  const service = buildSupabaseMock({
    selects: {
      profiles: { data: { is_active: options.active ?? true }, error: null },
      user_roles: { data: [{ role: options.role ?? "admin" }], error: null },
      organization_memberships: {
        data: [{ organization_id: orgId, member_type: "internal" }],
        error: null,
      },
      organizations: { data: [{ id: orgId, is_active: true }], error: null },
      invoices: {
        data: {
          id: invoiceId,
          organization_id: orgId,
          status: "draft",
          cfdi_status: "pending",
          line_items: [saleLine],
          receptor_rfc: "AAA010101AA1",
          receptor_regimen_fiscal: "601",
          receptor_domicilio_fiscal_cp: "64000",
          ...options.invoice,
        },
        error: null,
      },
    },
    selectsByFilter: {
      quotes: (filters) => {
        reads.quotes.push(filters);
        if (options.quoteThrows) throw new Error("Synthetic quote failure");
        return options.quotes ?? { data: [quote()], error: null };
      },
      company_settings: () => {
        reads.config++;
        return options.configError
          ? { data: null, error: { message: "Synthetic config failure" } }
          : { data: { facturapi_mode: "test" }, error: null };
      },
      billing_secrets: () => {
        reads.secrets++;
        return { data: null, error: null };
      },
    },
    updatesSeq: { invoices: [{ data: { id: invoiceId }, error: null }] },
  });
  return {
    service,
    reads,
    request: (body: Record<string, unknown> = {}) =>
      new Request("https://example.invalid/stamp-cfdi", {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-token",
          Origin: "https://liftgo.lovable.app",
        },
        body: JSON.stringify({ invoice_id: invoiceId, ...body }),
      }),
    deps: {
      createCallerClient: () => caller.client,
      createServiceClient: () => service.client,
      createInvoiceGateway: (_key: string) => {
        reads.gateway++;
        return {
          create: (payload: Record<string, unknown>) => {
            reads.payloads.push(payload);
            return Promise.resolve({ id: "fake-pending", status: "pending" });
          },
          downloadXml: () => {
            throw new Error("Unexpected PAC download");
          },
          downloadPdf: () => {
            throw new Error("Unexpected PAC download");
          },
        };
      },
      env: (key: string) => {
        reads.env++;
        return key === "FACTURAPI_TEST_KEY" && !options.stub
          ? "sk_test_fixture_only"
          : undefined;
      },
    },
  };
}

function noEffects(f: ReturnType<typeof fixture>) {
  assertEquals(f.service.updates, []);
  assertEquals(f.service.inserts, []);
  assertEquals(f.service.uploads, []);
  assertEquals(f.service.rpcCalls, []);
  assertEquals(f.reads.config, 0);
  assertEquals(f.reads.secrets, 0);
  assertEquals(f.reads.env, 0);
  assertEquals(f.reads.gateway, 0);
  assertEquals(f.reads.payloads, []);
}

function offlineTest(name: string, run: () => Promise<void>) {
  Deno.test(`sale SAT handler: ${name}`, async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => {
      calls++;
      throw new Error("Network forbidden");
    };
    try {
      await run();
      assertEquals(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
}

for (const field of ["clave_prod_serv", "clave_unidad"]) {
  for (const value of [undefined, null, "", " \t", 123]) {
    offlineTest(
      `line_kind sale missing ${field}=${JSON.stringify(value)}`,
      async () => {
        const f = fixture({
          invoice: { line_items: [{ ...saleLine, [field]: value }] },
        });
        const response = await handleStampCfdi(f.request(), f.deps);
        assertEquals(response.status, 422);
        assertEquals((await response.json()).code, "SALE_SAT_CODES_REQUIRED");
        assertEquals(
          response.headers.get("Access-Control-Allow-Origin"),
          "https://liftgo.lovable.app",
        );
        assertEquals(response.headers.get("Content-Type"), "application/json");
        assertEquals(f.reads.quotes, []);
        noEffects(f);
      },
    );
  }
}

offlineTest(
  "sale quote legacy lines are gated with exact tenant filters and ignore body flags",
  async () => {
    const f = fixture({
      invoice: { quote_id: quoteId, line_items: [{ description: "Equipo" }] },
    });
    const response = await handleStampCfdi(
      f.request({
        quote_type: "rental",
        quote_id: null,
        line_items: [explicit],
      }),
      f.deps,
    );
    assertEquals(response.status, 422);
    assertEquals((await response.json()).code, "SALE_SAT_CODES_REQUIRED");
    assertEquals(f.reads.quotes, [[{ col: "organization_id", val: orgId }, {
      col: "id",
      val: [quoteId],
    }]]);
    noEffects(f);
  },
);

offlineTest(
  "source-only sale in mixed invoice cannot use rental fallback",
  async () => {
    const f = fixture({
      invoice: {
        quote_id: quoteId,
        line_items: [{ line_kind: "rental" }, { source_quote_id: sourceId }],
      },
      quotes: {
        data: [quote(quoteId, "rental"), quote(sourceId)],
        error: null,
      },
    });
    const response = await handleStampCfdi(f.request(), f.deps);
    assertEquals(response.status, 422);
    assertEquals((await response.json()).error.includes("explícita: 2."), true);
    assertEquals(f.reads.quotes, [[{ col: "organization_id", val: orgId }, {
      col: "id",
      val: [quoteId, sourceId],
    }]]);
    noEffects(f);
  },
);

for (
  const [name, quotes, status] of [
    ["query error", { data: null, error: { message: "Unavailable" } }, 503],
    ["missing", { data: [], error: null }, 422],
    ["null", { data: null, error: null }, 422],
    ["malformed row", { data: [null], error: null }, 422],
    ["malformed response", { data: quote(), error: null }, 422],
    ["foreign organization", {
      data: [{ ...quote(), organization_id: otherOrg }],
      error: null,
    }, 422],
    ["wrong id", { data: [quote(sourceId)], error: null }, 422],
    ["unknown type", { data: [quote(quoteId, "unknown")], error: null }, 422],
    [
      "null type",
      { data: [{ ...quote(), quote_type: null }], error: null },
      422,
    ],
  ] as const
) {
  offlineTest(
    `source ${name} fails closed even with explicit codes`,
    async () => {
      const f = fixture({ invoice: { quote_id: quoteId }, quotes });
      const response = await handleStampCfdi(f.request(), f.deps);
      assertEquals(response.status, status);
      assertEquals(
        response.headers.get("Access-Control-Allow-Origin"),
        "https://liftgo.lovable.app",
      );
      noEffects(f);
    },
  );
}

offlineTest(
  "duplicate/incomplete source sets cannot pass by row count",
  async () => {
    for (const data of [[quote(), quote()], [quote()]]) {
      const f = fixture({
        invoice: {
          quote_id: quoteId,
          line_items: [{ ...explicit, source_quote_id: sourceId }],
        },
        quotes: { data, error: null },
      });
      assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 422);
      noEffects(f);
    }
  },
);

offlineTest("thrown source error fails closed before claim", async () => {
  const f = fixture({ invoice: { quote_id: quoteId }, quoteThrows: true });
  const response = await handleStampCfdi(f.request(), f.deps);
  assertEquals(response.status, 503);
  assertEquals(
    (await response.json()).code,
    "INVOICE_QUOTE_SOURCE_UNAVAILABLE",
  );
  noEffects(f);
});

offlineTest(
  "malformed reference values fail without source reads",
  async () => {
    for (
      const invoice of [{ quote_id: "" }, { quote_id: "not-a-uuid" }, {
        line_items: [{ ...saleLine, source_quote_id: 123 }],
      }]
    ) {
      const f = fixture({ invoice });
      const response = await handleStampCfdi(f.request(), f.deps);
      assertEquals(response.status, 422);
      assertEquals(
        (await response.json()).code,
        "INVOICE_QUOTE_SOURCE_INVALID",
      );
      assertEquals(f.reads.quotes, []);
      noEffects(f);
    }
  },
);

offlineTest(
  "malformed sale concepts cannot reach stub/config/PAC",
  async () => {
    for (const line_items of [null, {}, [], [null], ["sale"]]) {
      const f = fixture({
        stub: true,
        configError: true,
        invoice: { quote_id: quoteId, line_items },
      });
      assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 422);
      noEffects(f);
    }
  },
);

offlineTest(
  "auth, role, tenant and issued identities precede quote/gate reads",
  async () => {
    for (
      const scenario of [
        { status: 401, auth: false },
        { status: 403, active: false },
        { status: 403, role: "mechanic" },
        { status: 403, invoice: { organization_id: otherOrg } },
        { status: 403, invoice: { is_e2e: true } },
        {
          status: 409,
          invoice: { cfdi_status: "stamped", cfdi_uuid: sourceId },
        },
        { status: 409, invoice: { facturapi_invoice_id: "already-created" } },
      ]
    ) {
      const f = fixture({
        ...scenario,
        invoice: { quote_id: quoteId, line_items: [], ...scenario.invoice },
      });
      const request = f.request();
      if (scenario.auth === false) request.headers.delete("Authorization");
      assertEquals(
        (await handleStampCfdi(request, f.deps)).status,
        scenario.status,
      );
      assertEquals(f.reads.quotes, []);
      noEffects(f);
    }
  },
);

offlineTest(
  "explicit sale quote codes survive with deduplicated source query",
  async () => {
    const f = fixture({
      invoice: {
        quote_id: quoteId,
        line_items: [{ ...explicit, source_quote_id: quoteId }],
      },
    });
    assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 202);
    assertEquals(f.reads.quotes[0][1], { col: "id", val: [quoteId] });
    assertEquals(f.reads.gateway, 1);
    const items = f.reads.payloads[0].items as Array<
      { product: Record<string, unknown> }
    >;
    assertEquals(items[0].product.product_key, "24101600");
    assertEquals(items[0].product.unit_key, "H87");
  },
);

offlineTest(
  "explicit source-only sale preserves unlinked rental defaults",
  async () => {
    const f = fixture({
      invoice: {
        line_items: [{ description: "Renta" }, {
          ...explicit,
          source_quote_id: sourceId,
        }],
      },
      quotes: { data: [quote(sourceId)], error: null },
    });
    assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 202);
    const products =
      (f.reads.payloads[0].items as Array<{ product: Record<string, unknown> }>)
        .map(({ product }) => [product.product_key, product.unit_key]);
    assertEquals(products, [["78101803", "E48"], ["24101600", "H87"]]);
  },
);

offlineTest("known rental quote retains existing fallback", async () => {
  const f = fixture({
    invoice: { quote_id: quoteId, line_items: [{}] },
    quotes: { data: [quote(quoteId, "rental")], error: null },
  });
  assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 202);
  const items = f.reads.payloads[0].items as Array<
    { product: Record<string, unknown> }
  >;
  assertEquals([items[0].product.product_key, items[0].product.unit_key], [
    "78101803",
    "E48",
  ]);
});

offlineTest(
  "valid sale still respects fiscal config errors without PAC",
  async () => {
    const f = fixture({ invoice: { quote_id: quoteId }, configError: true });
    assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 503);
    assertEquals(f.reads.config, 1);
    assertEquals(f.reads.gateway, 0);
    assertEquals(f.service.updates.map(({ patch }) => patch.cfdi_status), [
      "stamping",
      "error",
    ]);
  },
);

offlineTest(
  "persisted marker survives missing sale provenance and gates the stub",
  async () => {
    const f = fixture({
      stub: true,
      invoice: {
        quote_id: null,
        line_items: [{ line_kind: "manual", sat_selection_required: true }],
      },
    });
    const response = await handleStampCfdi(f.request(), f.deps);
    assertEquals(response.status, 422);
    assertEquals((await response.json()).code, "SALE_SAT_CODES_REQUIRED");
    assertEquals(f.reads.quotes, []);
    noEffects(f);
  },
);

offlineTest("corrupt persisted marker cannot disable the gate", async () => {
  for (const marker of [null, "false", 1, {}]) {
    const f = fixture({
      invoice: {
        line_items: [{
          ...explicit,
          line_kind: "manual",
          sat_selection_required: marker,
        }],
      },
    });
    const response = await handleStampCfdi(f.request(), f.deps);
    assertEquals(response.status, 422);
    assertEquals((await response.json()).code, "SAT_SELECTION_MARKER_INVALID");
    noEffects(f);
  }
});

offlineTest(
  "explicit persisted marker permits issuing without inventing line kind",
  async () => {
    const f = fixture({
      invoice: {
        line_items: [{
          ...explicit,
          line_kind: "manual",
          sat_selection_required: true,
        }],
      },
    });
    assertEquals((await handleStampCfdi(f.request(), f.deps)).status, 202);
    const items = f.reads.payloads[0].items as Array<
      { product: Record<string, unknown> }
    >;
    assertEquals([items[0].product.product_key, items[0].product.unit_key], [
      "24101600",
      "H87",
    ]);
  },
);

offlineTest(
  "false request marker cannot relax a stored source or marker requirement",
  async () => {
    for (
      const invoice of [
        {
          quote_id: quoteId,
          line_items: [{ line_kind: "manual", sat_selection_required: false }],
        },
        { line_items: [{ line_kind: "manual", sat_selection_required: true }] },
      ]
    ) {
      const f = fixture({ invoice });
      const response = await handleStampCfdi(
        f.request({ sat_selection_required: false }),
        f.deps,
      );
      assertEquals(response.status, 422);
      noEffects(f);
    }
  },
);

offlineTest(
  "mixed rental and marked manual lines require only the marked missing codes",
  async () => {
    const rental = { description: "Renta", source_quote_id: quoteId };
    for (const filled of [false, true]) {
      const manual = {
        line_kind: "manual",
        sat_selection_required: true,
        ...(filled ? explicit : {}),
      };
      const f = fixture({
        invoice: { quote_id: quoteId, line_items: [rental, manual] },
        quotes: { data: [quote(quoteId, "rental")], error: null },
      });
      const response = await handleStampCfdi(f.request(), f.deps);
      assertEquals(response.status, filled ? 202 : 422);
      if (!filled) {
        noEffects(f);
        assertEquals(
          (await response.json()).error.includes("explícita: 2."),
          true,
        );
      } else {
        const products = (f.reads.payloads[0].items as Array<
          { product: Record<string, unknown> }
        >).map(({ product }) => [product.product_key, product.unit_key]);
        assertEquals(products, [["78101803", "E48"], ["24101600", "H87"]]);
      }
    }
    assertEquals(rental, { description: "Renta", source_quote_id: quoteId });
  },
);
