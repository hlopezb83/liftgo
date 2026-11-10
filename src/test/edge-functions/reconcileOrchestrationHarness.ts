import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import {
  createNcPdfRecoveryFixture,
  ORGANIZATION_A,
  PDF_BYTES,
  PDF_NOW,
  pdfPendingNote,
  type Row,
} from "./ncPdfRecoveryFixture";

// Mock only I/O boundaries. The handler, organization resolution, CORS/HTTP,
// decisions, storage paths, and all five lane processors execute real code.
const mocks = vi.hoisted(() => {
  vi.stubGlobal("Deno", { env: { get: vi.fn() } });
  return {
    admin: null as unknown,
    getAdmin: vi.fn(),
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
    events: [] as string[],
  };
});
export { mocks };
vi.mock("../../../supabase/functions/_shared/supabaseClients.ts", () => ({
  getAdminClient: () => {
    mocks.getAdmin();
    return mocks.admin;
  },
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authenticateCronRequest: mocks.auth,
}));
vi.mock("../../../supabase/functions/_shared/facturapi/invoiceRecovery.ts", () => ({
  lookupPacInvoice: mocks.lookup,
}));
vi.mock("../../../supabase/functions/_shared/repFolio.ts", () => ({
  assignRepFolio: mocks.folio,
  repFolioPendingMessage: String,
}));
vi.mock("../../../supabase/functions/_shared/facturapi/client.ts", () => ({
  getFacturapiConfigForOrganization: mocks.config,
  createFacturapiClient: mocks.createClient,
  // SDK transport/abort behavior is covered by the real-SDK Deno contracts.
  // These orchestration doubles still require the processor to pass its signal.
  retrieveInvoiceWithSignal: (
    client: { invoices: { retrieve: (id: string) => Promise<unknown> } },
    id: string,
    options: { signal: AbortSignal },
  ) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    options.signal.throwIfAborted();
    return client.invoices.retrieve(id);
  },
  downloadInvoicePdfWithSignal: (
    client: { invoices: { downloadPdf: (id: string) => Promise<unknown> } },
    id: string,
    options: { signal: AbortSignal },
  ) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    options.signal.throwIfAborted();
    return client.invoices.downloadPdf(id);
  },
  binaryToText: async (value: unknown) => value,
  binaryToBytes: async (value: unknown) => value,
  retryOnFacturapi5xx: (fn: () => unknown) => fn(),
  describeFacturapiError: (error: Error) => ({ message: error.message }),
}));
// Dynamic import avoids putting Deno-only dependencies in the frontend TS graph.
const handlerPath = "../../../supabase/functions/reconcile-stamping-invoices/index.ts";
export const { handleRequest } = (await import(handlerPath)) as {
  handleRequest: (request: Request) => Promise<Response>;
};

export const NOW_MS = Date.parse(PDF_NOW);
export const STALE_AT = "2026-11-08T11:00:00.000Z";
export const CUTOFF = "2026-11-08T11:50:00.000Z";
export const DOC_UUID = "44444444-4444-4444-8444-444444444444";
export const LANE_ORDER = ["fac", "rep", "folio", "nc", "pdf"] as const;
export type Lane = (typeof LANE_ORDER)[number];
export const laneId = (lane: Lane) => lane === "pdf"
  ? "33333333-3333-4333-8333-333333333333"
  : `${lane}-1`;
export const laneTable = (lane: Lane) => lane === "fac" ? "invoices"
  : lane === "rep" || lane === "folio" ? "payments" : "credit_notes";
export const laneStatus: Record<Lane, string> = {
  fac: "reconciled",
  rep: "rep_reconciled",
  folio: "rep_folio_recovered",
  nc: "nc_reconciled",
  pdf: "nc_pdf_recovered",
};
export function laneRow(lane: Lane, overrides: Row = {}): Row {
  const common = {
    id: laneId(lane), organization_id: ORGANIZATION_A, updated_at: STALE_AT,
  };
  if (lane === "pdf") return pdfPendingNote({ ...common, facturapi_invoice_id: "pac-pdf", ...overrides });
  if (lane === "rep" || lane === "folio") return {
    ...common,
    invoice_id: "parent-invoice",
    rep_cfdi_status: lane === "rep" ? "stamping" : "stamped",
    rep_facturapi_id: `pac-${lane}`,
    rep_cfdi_uuid: DOC_UUID,
    rep_stamping_started_at: STALE_AT,
    rep_lookup_attempts: 0,
    rep_stamping_attempts: 0,
    rep_number: lane === "rep" ? "REP-100" : null,
    rep_folio: 100,
    ...overrides,
  };
  return {
    ...common, status: "stamping", cfdi_status: "stamping",
    facturapi_invoice_id: `pac-${lane}`, cfdi_uuid: DOC_UUID,
    stamping_attempts: 0, lookup_attempts: 0, serie: "A", folio: "1",
    ...overrides,
  };
}

export function fixture(lanes: readonly Lane[] = LANE_ORDER) {
  const db = createNcPdfRecoveryFixture(mocks, []);
  for (const lane of lanes) db.tables[laneTable(lane)].push(laneRow(lane));
  const rpc = vi.fn(async (name: string, args: Row) => {
    mocks.events.push(`rpc:${name}:${args.p_invoice_id}`);
    return { data: null, error: null };
  });
  const admin = { ...db.admin, rpc };
  mocks.admin = admin;
  return { ...db, admin, rpc };
}

export function request(headers: Record<string, string> = {}, body?: Row, method = "POST") {
  const req = new Request("http://localhost/reconcile", {
    method, headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  // happy-dom strips Origin as a browser-forbidden header. Edge requests
  // receive it from the browser, so restore the server-side header snapshot.
  Object.defineProperty(req, "headers", { value: new Headers(headers) });
  return req;
}
export type ReconcileResult = {
  processed: number;
  truncated?: boolean;
  results: Array<{ invoice_id: string; status: string; organization_id?: string; error?: string }>;
  organizations?: Array<{ organization_id: string; status: string; error?: string }>;
};
export async function reconcile(headers: Record<string, string> = {}, body?: Row): Promise<ReconcileResult> {
  const response = await handleRequest(request(headers, body));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json");
  return response.json();
}
export function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.events.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_MS);
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.config.mockImplementation(async ({ organizationId }: { organizationId: string }) => {
    mocks.events.push(`config:${organizationId}`);
    return { apiKey: `offline-${organizationId}`, mode: "test" };
  });
  mocks.createClient.mockImplementation((key: string) => ({
    key,
    invoices: {
      retrieve: mocks.retrieve, downloadPdf: mocks.pdf, downloadXml: mocks.xml,
      create: mocks.create, cancel: mocks.cancel, list: mocks.list,
    },
  }));
  mocks.lookup.mockResolvedValue({ kind: "hit", facturapi_id: "pac-recovered", uuid: DOC_UUID });
  mocks.retrieve.mockImplementation(async (id: string) => {
    mocks.events.push(`retrieve:${id}`);
    return { id, uuid: DOC_UUID, type: "E", livemode: false, status: "valid", folio_number: 100 };
  });
  mocks.xml.mockImplementation(async (id: string) => {
    mocks.events.push(`xml:${id}`);
    return "<xml />";
  });
  mocks.pdf.mockImplementation(async (id: string) => {
    mocks.events.push(`pdf:${id}`);
    return PDF_BYTES.slice();
  });
  mocks.folio.mockImplementation(async (_admin: unknown, args: { paymentId: string }) => {
    mocks.events.push(`folio:${args.paymentId}`);
    return { ok: true };
  });
});
afterEach(() => {
  for (const forbidden of [mocks.create, mocks.cancel, mocks.list]) {
    expect(forbidden).not.toHaveBeenCalled();
  }
  vi.useRealTimers();
});
afterAll(() => vi.unstubAllGlobals());
