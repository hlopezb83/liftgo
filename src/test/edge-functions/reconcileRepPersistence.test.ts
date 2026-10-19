import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  lookup: vi.fn(),
  xml: vi.fn(),
  pdf: vi.fn(),
  folio: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/supabaseClients.ts", () => ({
  getAdminClient: () => mocks.admin,
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authenticateCronRequest: async () => ({ ok: true }),
}));
vi.mock("../../../supabase/functions/_shared/cors.ts", () => ({
  handleCors: () => null,
}));
vi.mock("../../../supabase/functions/_shared/http.ts", () => ({
  jsonResponse: (_req: Request, body: unknown, init: ResponseInit) =>
    new Response(JSON.stringify(body), init),
}));
vi.mock(
  "../../../supabase/functions/_shared/facturapi/invoiceRecovery.ts",
  () => ({ lookupPacInvoice: mocks.lookup }),
);
vi.mock("../../../supabase/functions/_shared/repFolio.ts", () => ({
  assignRepFolio: mocks.folio,
  repFolioPendingMessage: String,
}));
vi.mock("../../../supabase/functions/_shared/facturapi/client.ts", () => ({
  getFacturapiConfigForOrganization: async () => ({
    apiKey: "offline-test",
    mode: "test",
  }),
  createFacturapiClient: () => ({
    invoices: { downloadXml: mocks.xml, downloadPdf: mocks.pdf },
  }),
  binaryToText: async (x: unknown) => x,
  binaryToBytes: async (x: unknown) => x,
  retryOnFacturapi5xx: (fn: () => unknown) => fn(),
  describeFacturapiError: (err: Error) => ({ message: err.message }),
}));
// Keep Deno-only imports out of the browser TypeScript graph. Vitest still
// executes the real handler, with every external dependency mocked above.
const handlerPath =
  "../../../supabase/functions/reconcile-stamping-invoices/index.ts";
const { handleRequest } = (await import(handlerPath)) as {
  handleRequest: (req: Request) => Promise<Response>;
};

type Write = Record<string, unknown>;
function fixture(
  fail: "ids" | "stamped" | "xml" | "none",
  noRow = false,
  attempts = 0,
  existingIds = false,
) {
  const payment: Write = {
    id: "payment-1",
    organization_id: "11111111-1111-4111-8111-111111111111",
    invoice_id: "invoice-1",
    rep_cfdi_status: "stamping",
    rep_cfdi_uuid: existingIds ? "22222222-2222-4222-8222-222222222222" : null,
    rep_facturapi_id: existingIds ? "pac-1" : null,
    rep_stamping_started_at: "2026-01-01T00:00:00.000Z",
    rep_lookup_attempts: 2,
    rep_stamping_attempts: attempts,
    rep_number: fail === "none" ? "REP-1" : null,
    rep_folio: 1,
  };
  const writes: Write[] = [];
  const upload = vi.fn(async () => ({ error: null }));
  mocks.admin = {
    storage: { from: () => ({ upload }) },
    from(table: string) {
      let patch: Write | undefined;
      const filters: Record<string, unknown> = {};
      const result = () => {
        if (!patch)
          return {
            data:
              table === "payments" && filters.rep_cfdi_status === "stamping"
                ? [{ ...payment }]
                : [],
            error: null,
          };
        writes.push({ ...patch });
        const fails =
          (fail === "ids" &&
            "rep_facturapi_id" in patch &&
            !("rep_cfdi_status" in patch)) ||
          (fail === "stamped" && patch.rep_cfdi_status === "stamped") ||
          (fail === "xml" && "rep_stamping_attempts" in patch);
        if (fails)
          return {
            data: null,
            error: noRow ? null : { message: "injected persistence failure" },
          };
        Object.assign(payment, patch);
        return { data: { id: payment.id }, error: null };
      };
      const query = {
        select: () => query,
        update: (value: Write) => {
          patch = value;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        lt: () => query,
        limit: () => query,
        is: () => query,
        not: () => query,
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
  return { payment, writes, upload };
}
async function reconcile() {
  const response = await handleRequest(
    new Request("http://localhost/reconcile", { method: "POST" }),
  );
  expect(response.status).toBe(200);
  return (await response.json()).results;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({
    kind: "hit",
    facturapi_id: "pac-1",
    uuid: "22222222-2222-4222-8222-222222222222",
  });
  mocks.folio.mockResolvedValue({ ok: true });
  mocks.xml.mockResolvedValue("<xml />");
  mocks.pdf.mockResolvedValue(new Uint8Array([1, 2]));
});
describe("REP reconciler persistence boundaries (actual handler, no network)", () => {
  it.each([false, true])(
    "does not finalize after failed identifier persistence (noRow=%s)",
    async (noRow) => {
      const { payment, writes } = fixture("ids", noRow);
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "rep_persistence_error" }),
      ]);
      expect(payment.rep_cfdi_status).toBe("stamping");
      expect(payment.rep_stamping_started_at).not.toBeNull();
      expect(writes.some((write) => write.rep_cfdi_status === "stamped")).toBe(
        false,
      );
      expect(mocks.xml).not.toHaveBeenCalled();
      expect(mocks.folio).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "does not report success after failed finalization (noRow=%s)",
    async (noRow) => {
      const { payment } = fixture("stamped", noRow);
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "rep_persistence_error" }),
      ]);
      expect(payment.rep_cfdi_status).toBe("stamping");
      expect(payment.rep_facturapi_id).toBe("pac-1");
      expect(payment.rep_stamping_started_at).not.toBeNull();
      expect(mocks.folio).not.toHaveBeenCalled();
    },
  );
  it.each([
    [0, false],
    [0, true],
    [100, false],
    [100, true],
  ])(
    "does not report XML state persistence when update fails (attempts=%s, noRow=%s)",
    async (attempts, noRow) => {
      const { payment } = fixture("xml", noRow as boolean, attempts as number);
      mocks.xml.mockRejectedValue(new Error("XML unavailable"));
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "rep_persistence_error" }),
      ]);
      expect(payment.rep_cfdi_status).toBe("stamping");
      expect(payment.rep_facturapi_id).toBe("pac-1");
    },
  );
  it.each([false, true])(
    "finalizes normally (existingIds=%s)",
    async (existingIds) => {
      const { payment } = fixture("none", false, 0, existingIds);
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "rep_reconciled" }),
      ]);
      expect(payment.rep_cfdi_status).toBe("stamped");
      expect(payment.rep_facturapi_id).toBe("pac-1");
      expect(payment.rep_cfdi_uuid).toBe(
        "22222222-2222-4222-8222-222222222222",
      );
      expect(payment.rep_stamping_started_at).toBeNull();
      expect(mocks.lookup).toHaveBeenCalledTimes(existingIds ? 0 : 1);
    },
  );
  it.each([0, 100])(
    "persists XML recovery state on success (attempts=%s)",
    async (attempts) => {
      const { payment } = fixture("none", false, attempts, true);
      mocks.xml.mockRejectedValue(new Error("XML unavailable"));
      expect(await reconcile()).toEqual([
        expect.objectContaining({
          status:
            attempts === 0
              ? "rep_xml_pending"
              : "rep_stamped_xml_pending_manual",
        }),
      ]);
      expect(payment.rep_cfdi_status).toBe(
        attempts === 0 ? "stamping" : "stamped",
      );
      expect(payment.rep_facturapi_id).toBe("pac-1");
      expect(payment.rep_stamping_attempts).toBe(attempts + 1);
    },
  );
  it("assigns a missing folio only after acknowledged finalization", async () => {
    const { payment } = fixture("none");
    payment.rep_number = null;
    mocks.folio.mockImplementation(async () => {
      expect(payment.rep_cfdi_status).toBe("stamped");
      expect(payment.rep_facturapi_id).toBe("pac-1");
      return { ok: true };
    });
    expect(await reconcile()).toEqual([
      expect.objectContaining({ status: "rep_folio_recovered" }),
    ]);
    expect(mocks.folio).toHaveBeenCalledOnce();
  });
  it("preserves an uncertain PAC claim without consuming a lookup miss", async () => {
    const { payment, writes } = fixture("none");
    mocks.lookup.mockResolvedValue({ kind: "lookup_failed" });
    expect(await reconcile()).toEqual([
      expect.objectContaining({ status: "rep_lookup_deferred" }),
    ]);
    expect(payment.rep_cfdi_status).toBe("stamping");
    expect(payment.rep_lookup_attempts).toBe(2);
    expect(writes).toHaveLength(1); // only the optimistic timestamp claim
    expect(mocks.xml).not.toHaveBeenCalled();
  });
});
