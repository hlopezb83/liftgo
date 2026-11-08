import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNcPdfRecoveryFixture,
  ORGANIZATION_A,
  ORGANIZATION_B,
  PDF_BYTES,
  PDF_NOW,
  pdfPendingNote,
  type QueryRecord,
  type Row,
} from "./ncPdfRecoveryFixture";

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  auth: vi.fn(),
  config: vi.fn(),
  createClient: vi.fn(),
  lookup: vi.fn(),
  retrieve: vi.fn(),
  pdf: vi.fn(),
  xml: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
  folio: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/supabaseClients.ts", () => ({
  getAdminClient: () => mocks.admin,
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authenticateCronRequest: mocks.auth,
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
  () => ({
    lookupPacInvoice: mocks.lookup,
  }),
);
vi.mock("../../../supabase/functions/_shared/repFolio.ts", () => ({
  assignRepFolio: mocks.folio,
  repFolioPendingMessage: String,
}));
vi.mock("../../../supabase/functions/_shared/facturapi/client.ts", () => ({
  getFacturapiConfigForOrganization: mocks.config,
  createFacturapiClient: mocks.createClient,
  binaryToText: async (value: unknown) => value,
  binaryToBytes: async (value: unknown) => value,
  retryOnFacturapi5xx: (fn: () => unknown) => fn(),
  describeFacturapiError: (error: Error) => ({ message: error.message }),
}));
// Dynamic path keeps Deno-only dependencies outside the browser tsc graph.
const handlerPath =
  "../../../supabase/functions/reconcile-stamping-invoices/index.ts";
const { handleRequest } = (await import(handlerPath)) as {
  handleRequest: (request: Request) => Promise<Response>;
};
type Results = {
  processed: number;
  results: Array<{ invoice_id: string; status: string; error?: string }>;
};
const fixture = (notes?: Row[]) => createNcPdfRecoveryFixture(mocks, notes);
const pacInvoice = (overrides: Row = {}) => ({
  id: "pac-note-1",
  uuid: "44444444-4444-4444-8444-444444444444",
  type: "E",
  livemode: false,
  status: "valid",
  ...overrides,
});
async function reconcile(
  headers: Record<string, string> = {},
): Promise<Results> {
  const response = await handleRequest(
    new Request("http://localhost/reconcile", {
      method: "POST",
      headers,
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}
function unchangedFiscalFields(note: Row): Row {
  return Object.fromEntries(
    Object.entries(note).filter(
      ([key]) => key !== "updated_at" && key !== "cfdi_pdf_url",
    ),
  );
}
function expectGuardedCas(write: QueryRecord, snapshot: Row) {
  const exact = [
    "id",
    "organization_id",
    "status",
    "cfdi_status",
    "cancellation_status",
    "cfdi_uuid",
    "facturapi_invoice_id",
    "cfdi_xml_url",
    "updated_at",
  ];
  for (const column of exact) {
    expect(write.filters, `Missing CAS guard: ${column}`).toContainEqual({
      operator: "eq",
      column,
      value: snapshot[column],
    });
  }
  expect(write.filters).toContainEqual({
    operator: "is",
    column: "cfdi_pdf_url",
    value: null,
  });
  expect(write.filters).toContainEqual(
    expect.objectContaining({
      column: "cfdi_xml_pending",
      value: false,
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(PDF_NOW));
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.config.mockResolvedValue({ apiKey: "offline-test", mode: "test" });
  mocks.createClient.mockReturnValue({
    invoices: {
      retrieve: mocks.retrieve,
      downloadPdf: mocks.pdf,
      downloadXml: mocks.xml,
      create: mocks.create,
      cancel: mocks.cancel,
      list: mocks.list,
    },
  });
  mocks.retrieve.mockResolvedValue(pacInvoice());
  mocks.pdf.mockImplementation(async () => PDF_BYTES.slice());
});
afterEach(() => {
  // Every other PAC operation is forbidden, including fiscal creation,
  // cancellation, external-id lookup, XML redownload and REP folio work.
  for (const operation of [
    mocks.create,
    mocks.cancel,
    mocks.list,
    mocks.lookup,
    mocks.xml,
  ]) {
    expect(operation).not.toHaveBeenCalled();
  }
  vi.useRealTimers();
});

describe("NC PDF-only reconciliation: auth, eligibility and isolation", () => {
  it.each([401, 403])(
    "rejects unauthorized work before reads or PAC (%s)",
    async (status) => {
      const { reads, writes, upload } = fixture();
      mocks.auth.mockResolvedValue({
        ok: false,
        status,
        error: "Unauthorized",
      });
      const response = await handleRequest(
        new Request("http://localhost/reconcile", { method: "POST" }),
      );
      expect(response.status).toBe(status);
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
      expect(mocks.config).not.toHaveBeenCalled();
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("processes PDF-only NC work even with no invoices, REP or stamping NCs", async () => {
    const { notes, reads, writes, rpc } = fixture();
    const before = { ...notes[0] };
    const result = await reconcile();
    expect(result.processed).toBe(1);
    expect(result.results).toEqual([
      expect.objectContaining({ invoice_id: before.id }),
    ]);
    expect(notes[0].cfdi_pdf_url).toEqual(expect.stringMatching(/\.pdf$/));
    expect(unchangedFiscalFields(notes[0])).toEqual(
      unchangedFiscalFields(before),
    );
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith(
      before.facturapi_invoice_id,
    );
    expect(mocks.pdf).toHaveBeenCalledExactlyOnceWith(
      before.facturapi_invoice_id,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.folio).not.toHaveBeenCalled();
    expect(result.results[0].status).toBe("nc_pdf_recovered");
    const selection = reads.find(
      (query) =>
        query.table === "credit_notes" &&
        query.filters.some(
          (filter) =>
            filter.column === "cfdi_status" && filter.value === "stamped",
        ),
    );
    expect(selection).toBeDefined();
    expect(selection?.limit).toBe(10);
    expect(selection?.order).toContainEqual({
      column: "updated_at",
      ascending: true,
    });
    expect(selection?.filters).toContainEqual({
      operator: "lt",
      column: "updated_at",
      value: "2026-11-08T11:50:00.000Z",
    });
    expect(writes).toHaveLength(2);
    expectGuardedCas(writes[0], before);
    expect(writes[0].patch).toEqual({ updated_at: expect.any(String) });
    const claimTimestamp = writes[1].filters.find(
      (filter) => filter.column === "updated_at",
    )?.value;
    expect(claimTimestamp).not.toBe(writes[0].patch?.updated_at);
    expectGuardedCas(writes[1], { ...before, updated_at: claimTimestamp });
    expect(
      Object.keys(writes[1].patch ?? {}).filter((key) => key !== "updated_at"),
    ).toEqual(["cfdi_pdf_url"]);
  });

  it("scopes manual recovery to the server-resolved caller organization", async () => {
    const noteA = pdfPendingNote();
    const noteB = pdfPendingNote({
      id: "55555555-5555-4555-8555-555555555555",
      organization_id: ORGANIZATION_B,
    });
    const { reads } = fixture([noteA, noteB]);
    const result = await reconcile({ "x-caller-user-id": "manual-user" });
    expect(result.results.map((row) => row.invoice_id)).toEqual([noteA.id]);
    expect(noteB.cfdi_pdf_url).toBeNull();
    expect(mocks.config).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ organizationId: ORGANIZATION_A }),
    );
    for (const read of reads.filter((query) =>
      ["invoices", "payments", "credit_notes"].includes(query.table),
    )) {
      expect(read.filters).toContainEqual({
        operator: "eq",
        column: "organization_id",
        value: ORGANIZATION_A,
      });
    }
  });

  it.each(["missing", "ambiguous", "inactive", "lookup-error"])(
    "rejects unresolved manual tenant: %s",
    async (kind) => {
      const { tables, behavior, writes } = fixture();
      if (kind === "missing") tables.organization_memberships = [];
      if (kind === "ambiguous")
        tables.organization_memberships.push({
          ...tables.organization_memberships[0],
        });
      if (kind === "inactive") tables.organizations[0].is_active = false;
      if (kind === "lookup-error")
        behavior.readError = (query) =>
          query.table === "organization_memberships";
      const response = await handleRequest(
        new Request("http://localhost/reconcile", {
          method: "POST",
          headers: { "x-caller-user-id": "manual-user" },
        }),
      );
      expect(response.status).toBe(
        kind === "ambiguous" ? 409 : kind === "lookup-error" ? 503 : 403,
      );
      expect(writes).toEqual([]);
      expect(mocks.config).not.toHaveBeenCalled();
      expect(mocks.retrieve).not.toHaveBeenCalled();
    },
  );

  const excluded = [
    ["business state cancelled", { status: "cancelled" }],
    ["fiscal state cancelled", { cfdi_status: "cancelled" }],
    ["pending cancellation", { cancellation_status: "pending" }],
    ["accepted cancellation", { cancellation_status: "accepted" }],
    ["XML pending", { cfdi_xml_pending: true }],
    ["unknown XML state", { cfdi_xml_pending: null }],
    ["missing XML", { cfdi_xml_url: null }],
    ["blank XML", { cfdi_xml_url: "" }],
    ["missing UUID", { cfdi_uuid: null }],
    ["invalid UUID", { cfdi_uuid: "invalid" }],
    ["missing PAC id", { facturapi_invoice_id: null }],
    ["blank PAC id", { facturapi_invoice_id: "" }],
    ["existing PDF", { cfdi_pdf_url: `${ORGANIZATION_A}/existing.pdf` }],
    ["recent row", { updated_at: "2026-11-08T11:59:00.000Z" }],
    ["exact ten-minute boundary", { updated_at: "2026-11-08T11:50:00.000Z" }],
    ["missing timestamp", { updated_at: null }],
    ["invalid timestamp", { updated_at: "invalid" }],
  ] as const;
  it.each(excluded)("does not recover %s", async (_label, overrides) => {
    const note = pdfPendingNote(overrides);
    const before = { ...note };
    const { writes, upload } = fixture([note]);
    await reconcile();
    expect(note).toEqual(before);
    expect(writes).toEqual([]);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("selects at most ten oldest eligible NCs and leaves newer ones for later", async () => {
    const notes = Array.from({ length: 12 }, (_, index) =>
      pdfPendingNote({
        id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
        updated_at: `2026-11-08T11:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    ).reverse();
    fixture(notes);
    const result = await reconcile();
    expect(result.processed).toBe(10);
    expect(result.results.map((row) => row.invoice_id)).toEqual(
      [...notes]
        .reverse()
        .slice(0, 10)
        .map((note) => note.id),
    );
    expect(notes.filter((note) => note.cfdi_pdf_url !== null)).toHaveLength(10);
    expect(mocks.pdf).toHaveBeenCalledTimes(10);
  });

  it.each(["missing", "throws"])(
    "does not borrow credentials if organization config %s",
    async (kind) => {
      const { notes, writes, upload } = fixture();
      if (kind === "throws")
        mocks.config.mockRejectedValue(new Error("Config unavailable"));
      else mocks.config.mockResolvedValue({ apiKey: null, mode: "test" });
      const result = await reconcile();
      expect(result.results).toEqual([
        expect.objectContaining({ status: "org_misconfigured" }),
      ]);
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(writes).toEqual([]);
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("reports an orphan without resolving any other tenant's configuration", async () => {
    const { writes, upload } = fixture([
      pdfPendingNote({ organization_id: null }),
    ]);
    const result = await reconcile();
    expect(result.results).toEqual([
      expect.objectContaining({ status: "skipped_without_organization" }),
    ]);
    expect(writes).toEqual([]);
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "reports PDF selection failure without blocking other queues (REP=%s)",
    async (withRep) => {
      const { behavior, tables, writes } = fixture();
      behavior.readError = (query) =>
        query.table === "credit_notes" &&
        query.filters.some(
          (filter) =>
            filter.column === "cfdi_status" && filter.value === "stamped",
        );
      if (withRep) {
        tables.payments.push({
          id: "payment-1",
          organization_id: ORGANIZATION_A,
          invoice_id: "invoice-1",
          rep_cfdi_status: "stamped",
          rep_facturapi_id: "pac-rep-1",
          rep_number: null,
          rep_folio: 12,
        });
        mocks.folio.mockResolvedValue({ ok: true });
      }
      const result = await reconcile();
      expect(result.results.map((row) => row.status)).toEqual(
        withRep
          ? ["nc_pdf_selection_error", "rep_folio_recovered"]
          : ["nc_pdf_selection_error"],
      );
      expect(writes).toEqual([]);
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(mocks.pdf).not.toHaveBeenCalled();
      if (withRep)
        expect(mocks.folio).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
          paymentId: "payment-1",
          organizationId: ORGANIZATION_A,
          folio: 12,
        });
    },
  );
});

describe("NC PDF-only reconciliation: provider and binary safety", () => {
  it.each([
    ["provider id", { id: "other-id" }],
    ["CFDI UUID", { uuid: "66666666-6666-4666-8666-666666666666" }],
    ["invoice type", { type: "I" }],
    ["payment type", { type: "P" }],
    ["environment", { livemode: true }],
    ["missing environment", { livemode: undefined }],
    ["missing UUID", { uuid: undefined }],
    ["missing type", { type: undefined }],
    ["cancelled remote state", { status: "canceled" }],
    ["pending remote state", { status: "pending" }],
    ["missing remote state", { status: undefined }],
    [
      "foreign external id",
      { external_id: "55555555-5555-4555-8555-555555555555" },
    ],
  ])("does not download on %s mismatch", async (_label, overrides) => {
    const { notes, upload, committed } = fixture();
    mocks.retrieve.mockResolvedValue(pacInvoice(overrides as Row));
    const result = await reconcile();
    expect(result.processed).toBe(1);
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(committed).toHaveLength(1);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("accepts live PDF retrieval only when provider livemode matches configured live mode", async () => {
    const { notes } = fixture();
    mocks.config.mockResolvedValue({ apiKey: "offline-live", mode: "live" });
    mocks.retrieve.mockResolvedValue(pacInvoice({ livemode: true }));
    await reconcile();
    expect(notes[0].cfdi_pdf_url).toEqual(expect.any(String));
    expect(mocks.createClient).toHaveBeenCalledWith("offline-live");
  });

  it("accepts case-insensitive matching UUID and matching optional external id", async () => {
    const { notes } = fixture();
    notes[0].cfdi_uuid = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
    mocks.retrieve.mockResolvedValue(
      pacInvoice({
        uuid: String(notes[0].cfdi_uuid).toUpperCase(),
        external_id: notes[0].id,
      }),
    );
    expect((await reconcile()).results[0].status).toBe("nc_pdf_recovered");
  });

  it.each(["retrieve", "download"])(
    "bounds a stalled %s call to eight seconds and ignores a late result",
    async (stage) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(PDF_NOW));
      const { notes, upload, committed } = fixture();
      let release: (value: unknown) => void = () => {};
      const stalled = new Promise((resolve) => {
        release = resolve;
      });
      (stage === "retrieve" ? mocks.retrieve : mocks.pdf).mockReturnValue(
        stalled,
      );
      const pending = reconcile();
      await vi.advanceTimersByTimeAsync(8_001);
      const result = await pending;
      expect(result.results[0].status).toBe("nc_pdf_recovery_pending");
      release(stage === "retrieve" ? pacInvoice() : PDF_BYTES);
      await vi.advanceTimersByTimeAsync(1);
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(committed).toHaveLength(1);
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it.each([
    "retrieve-error",
    "retrieve-timeout",
    "download-error",
    "download-timeout",
  ])(
    "keeps a claimed NC pending after %s without fiscal mutation",
    async (kind) => {
      const { notes, upload, committed } = fixture();
      const before = unchangedFiscalFields(notes[0]);
      const error = new Error("PAC unavailable");
      if (kind.endsWith("timeout")) error.name = "TimeoutError";
      (kind.startsWith("retrieve")
        ? mocks.retrieve
        : mocks.pdf
      ).mockRejectedValue(error);
      await reconcile();
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(unchangedFiscalFields(notes[0])).toEqual(before);
      expect(committed).toHaveLength(1);
      expect(upload).not.toHaveBeenCalled();
      await reconcile();
      expect(mocks.retrieve).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["empty", () => new Uint8Array()],
    ["HTML", () => new TextEncoder().encode("<html>provider error</html>")],
    ["wrong magic", () => new TextEncoder().encode("%PDX-1.7\n")],
    ["embedded PDF magic", () => new TextEncoder().encode("error %PDF-1.7\n")],
    [
      "over 10 MiB",
      () => {
        const bytes = new Uint8Array(10 * 1024 * 1024 + 1);
        bytes.set(PDF_BYTES);
        return bytes;
      },
    ],
  ] as const)("rejects %s bytes before Storage", async (_label, makeBytes) => {
    const { notes, upload } = fixture();
    mocks.pdf.mockResolvedValue(makeBytes());
    await reconcile();
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([PDF_BYTES.byteLength, 10 * 1024 * 1024])(
    "uploads valid %s-byte PDF under the row tenant",
    async (size) => {
      const { notes, upload, storageFrom } = fixture();
      const bytes = new Uint8Array(size);
      bytes.set(PDF_BYTES);
      mocks.pdf.mockResolvedValue(bytes);
      await reconcile();
      expect(storageFrom).toHaveBeenCalledWith("cfdi-files");
      expect(upload).toHaveBeenCalledOnce();
      const [path, stored, options] = upload.mock.calls[0];
      expect(path).toMatch(
        new RegExp(
          `^${ORGANIZATION_A}/credit-notes/${notes[0].id}/${notes[0].cfdi_uuid}-recovery-[a-f0-9-]{36}\\.pdf$`,
        ),
      );
      expect(stored.byteLength).toBe(size);
      expect(stored.subarray(0, PDF_BYTES.byteLength)).toEqual(PDF_BYTES);
      expect(options.contentType).toBe("application/pdf");
      expect(options.upsert).toBe(false);
      expect(notes[0].cfdi_pdf_url).toBe(path);
    },
  );

  const supportedBodies = [
    ["ArrayBuffer", () => PDF_BYTES.slice().buffer],
    ["Blob", () => new Blob([PDF_BYTES.slice()])],
    ["Response", () => new Response(PDF_BYTES.slice())],
    ["SDK data wrapper", () => ({ data: PDF_BYTES.slice() })],
    [
      "stream",
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(PDF_BYTES.slice(0, 3));
            controller.enqueue(PDF_BYTES.slice(3));
            controller.close();
          },
        }),
    ],
  ] as const;
  it.each(supportedBodies)(
    "accepts bounded binary %s bodies",
    async (_kind, makeBody) => {
      const { upload } = fixture();
      mocks.pdf.mockResolvedValue(makeBody());
      expect((await reconcile()).results[0].status).toBe("nc_pdf_recovered");
      expect(upload.mock.calls[0][1]).toEqual(PDF_BYTES);
    },
  );

  it.each([
    ["text", (): string => "%PDF-1.7 text is not a binary download"],
    ["HTTP error", () => new Response(PDF_BYTES.slice(), { status: 503 })],
    [
      "invalid stream chunks",
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue("%PDF-1.7");
            controller.close();
          },
        }),
    ],
    [
      "oversized stream",
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(PDF_BYTES.slice());
            controller.enqueue(new Uint8Array(10 * 1024 * 1024));
            controller.close();
          },
        }),
    ],
  ] as const)("rejects %s bodies", async (_kind, makeBody) => {
    const { notes, upload } = fixture();
    mocks.pdf.mockResolvedValue(makeBody());
    expect((await reconcile()).results[0].status).toBe(
      "nc_pdf_recovery_pending",
    );
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("cancels a stalled PDF stream on timeout without uploading partial bytes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PDF_NOW));
    const { notes, upload } = fixture();
    const cancel = vi.fn();
    mocks.pdf.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(PDF_BYTES.slice());
        },
        cancel,
      }),
    );
    const pending = reconcile();
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await pending).results[0].status).toBe("nc_pdf_recovery_pending");
    expect(cancel).toHaveBeenCalledOnce();
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(["error", "throw"])(
    "does not persist PDF when upload returns %s",
    async (kind) => {
      const { notes, upload, committed } = fixture();
      if (kind === "throw")
        upload.mockRejectedValue(new Error("Storage unavailable"));
      else
        upload.mockResolvedValue({
          data: { path: "unused" },
          error: { message: "Storage unavailable" },
        });
      await reconcile();
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(committed).toHaveLength(1);
    },
  );
});

describe("NC PDF-only reconciliation: claims, retries and concurrent changes", () => {
  it.each(["error", "zero", "throw"] as const)(
    "never contacts PAC after claim %s",
    async (outcome) => {
      const { behavior, notes, upload, committed } = fixture();
      const before = { ...notes[0] };
      behavior.failure = { stage: "claim", outcome };
      const result = await reconcile();
      expect(result.processed).toBe(1);
      expect(notes[0]).toEqual(before);
      expect(committed).toEqual([]);
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(mocks.pdf).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it.each(["error", "zero", "throw"] as const)(
    "does not report recovered after final write %s",
    async (outcome) => {
      const { behavior, notes, upload, committed } = fixture();
      behavior.failure = { stage: "final", outcome };
      const before = unchangedFiscalFields(notes[0]);
      const result = await reconcile();
      expect(result.processed).toBe(1);
      expect(result.results[0].status).not.toMatch(/recovered|reconciled/);
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(unchangedFiscalFields(notes[0])).toEqual(before);
      expect(upload).toHaveBeenCalledOnce();
      expect(committed).toHaveLength(1);
    },
  );

  it("only one overlapping invocation can claim the same NC", async () => {
    const { notes, committed, upload } = fixture();
    await Promise.all([reconcile(), reconcile()]);
    expect(notes[0].cfdi_pdf_url).toEqual(expect.any(String));
    expect(
      committed.filter((write) => !write.patch?.cfdi_pdf_url),
    ).toHaveLength(1);
    expect(mocks.retrieve).toHaveBeenCalledOnce();
    expect(mocks.pdf).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
  });

  it.each([
    ["cancelled business state", { status: "cancelled" }],
    ["cancelled fiscal state", { cfdi_status: "cancelled" }],
    ["requested cancellation", { cancellation_status: "pending" }],
    [
      "other worker PDF",
      { cfdi_pdf_url: `${ORGANIZATION_A}/other-worker.pdf` },
    ],
    ["new claim", { updated_at: "2026-11-08T12:20:00.123456Z" }],
    ["changed UUID", { cfdi_uuid: "77777777-7777-4777-8777-777777777777" }],
    ["changed provider id", { facturapi_invoice_id: "new-pac-id" }],
    ["changed XML path", { cfdi_xml_url: `${ORGANIZATION_A}/new.xml` }],
    ["XML pending", { cfdi_xml_pending: true }],
    ["changed organization", { organization_id: ORGANIZATION_B }],
  ])("does not overwrite %s during download", async (_label, mutation) => {
    const { notes, committed } = fixture();
    mocks.pdf.mockImplementation(async () => {
      Object.assign(notes[0], mutation);
      return PDF_BYTES;
    });
    const result = await reconcile();
    expect(result.results[0].status).not.toMatch(/recovered|reconciled/);
    expect(notes[0]).toMatchObject(mutation);
    if (!("cfdi_pdf_url" in mutation)) expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(committed).toHaveLength(1);
  });

  it("cannot claim a row changed after selection", async () => {
    const { notes, behavior, committed } = fixture();
    behavior.beforeWrite = (query) => {
      if (query.patch && !("cfdi_pdf_url" in query.patch))
        notes[0].status = "cancelled";
    };
    await reconcile();
    expect(notes[0].status).toBe("cancelled");
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(committed).toEqual([]);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("preserves a manual PDF saved while Storage upload was in flight", async () => {
    const { notes, upload, committed } = fixture();
    const manualPdf = `${ORGANIZATION_A}/manual-recovery.pdf`;
    upload.mockImplementation(async (path) => {
      notes[0].cfdi_pdf_url = manualPdf;
      return { data: { path }, error: null };
    });
    expect((await reconcile()).results[0].status).toBe(
      "nc_pdf_persistence_error",
    );
    expect(notes[0].cfdi_pdf_url).toBe(manualPdf);
    expect(upload.mock.calls[0][0]).not.toBe(manualPdf);
    expect(upload.mock.calls[0][2].upsert).toBe(false);
    expect(committed).toHaveLength(1);
  });

  it("uses a fresh attempt-owned object after an unconfirmed final write", async () => {
    const { behavior, upload, notes } = fixture();
    behavior.failure = { stage: "final", outcome: "zero" };
    await reconcile();
    vi.setSystemTime(new Date("2026-11-08T12:11:00.000Z"));
    behavior.failure = undefined;
    expect((await reconcile()).results[0].status).toBe("nc_pdf_recovered");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][0]).not.toBe(upload.mock.calls[1][0]);
    expect(notes[0].cfdi_pdf_url).toBe(upload.mock.calls[1][0]);
  });

  it("does not re-fetch a recovered PDF on subsequent runs, even after ten minutes", async () => {
    const { notes, upload } = fixture();
    await reconcile();
    const recovered = { ...notes[0] };
    vi.setSystemTime(new Date("2026-11-08T13:00:00.000Z"));
    expect((await reconcile()).processed).toBe(0);
    expect(notes[0]).toEqual(recovered);
    expect(mocks.retrieve).toHaveBeenCalledOnce();
    expect(mocks.pdf).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
  });

  it("uses the existing timestamp for a ten-minute retry cooldown without new counters", async () => {
    const { notes, writes } = fixture();
    const before = unchangedFiscalFields(notes[0]);
    mocks.pdf.mockRejectedValue(new Error("Temporary PDF failure"));
    await reconcile();
    vi.setSystemTime(new Date("2026-11-08T12:09:59.999Z"));
    expect((await reconcile()).processed).toBe(0);
    expect(mocks.pdf).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date("2026-11-08T12:10:00.001Z"));
    await reconcile();
    expect(mocks.pdf).toHaveBeenCalledTimes(2);
    expect(unchangedFiscalFields(notes[0])).toEqual(before);
    for (const write of writes)
      expect(Object.keys(write.patch ?? {})).toEqual(["updated_at"]);
  });
});
