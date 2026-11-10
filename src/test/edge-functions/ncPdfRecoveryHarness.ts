import { afterEach, beforeEach, expect, vi } from "vitest";
import {
  createNcPdfRecoveryFixture,
  PDF_BYTES,
  PDF_NOW,
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
  retrieveWithSignal: vi.fn(),
  pdfWithSignal: vi.fn(),
  pdf: vi.fn(),
  xml: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
  folio: vi.fn(),
}));
export { mocks };
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
  retrieveInvoiceWithSignal: mocks.retrieveWithSignal,
  downloadInvoicePdfWithSignal: mocks.pdfWithSignal,
  binaryToText: async (value: unknown) => value,
  binaryToBytes: async (value: unknown) => value,
  retryOnFacturapi5xx: (fn: () => unknown) => fn(),
  describeFacturapiError: (error: Error) => ({ message: error.message }),
}));
// Dynamic path keeps Deno-only dependencies outside the browser tsc graph.
const handlerPath =
  "../../../supabase/functions/reconcile-stamping-invoices/index.ts";
export const { handleRequest } = (await import(handlerPath)) as {
  handleRequest: (request: Request) => Promise<Response>;
};
type Results = {
  processed: number;
  results: Array<{ invoice_id: string; status: string; error?: string }>;
};
export const fixture = (notes?: Row[]) =>
  createNcPdfRecoveryFixture(mocks, notes);
export const pacInvoice = (overrides: Row = {}) => ({
  id: "pac-note-1",
  uuid: "44444444-4444-4444-8444-444444444444",
  type: "E",
  livemode: false,
  status: "valid",
  ...overrides,
});
export async function reconcile(
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
export function unchangedFiscalFields(note: Row): Row {
  return Object.fromEntries(
    Object.entries(note).filter(
      ([key]) => key !== "updated_at" && key !== "cfdi_pdf_url",
    ),
  );
}
export function expectGuardedCas(write: QueryRecord, snapshot: Row) {
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

// Keep the SDK adapter at the existing I/O mock boundary. The real adapter's
// transport behavior is covered by sdk6_contract_test.ts; these spies retain
// the per-call signal so handler tests can verify timeout cancellation.
type InvoiceIoClient = {
  invoices: {
    retrieve: (id: string) => Promise<unknown>;
    downloadPdf: (id: string) => Promise<unknown>;
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.retrieveWithSignal.mockImplementation(
    (client: InvoiceIoClient, id: string, options: { signal?: AbortSignal }) => {
      options.signal?.throwIfAborted();
      return client.invoices.retrieve(id);
    },
  );
  mocks.pdfWithSignal.mockImplementation(
    (client: InvoiceIoClient, id: string, options: { signal?: AbortSignal }) => {
      options.signal?.throwIfAborted();
      return client.invoices.downloadPdf(id);
    },
  );
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
