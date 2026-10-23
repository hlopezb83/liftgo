import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://billing-evidence.invalid", "offline-fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  }) };
});
import { useBookingBillingEvidence } from "../invoices/useBookingBillingEvidence";
import { useInvoiceBookingPeriods } from "../invoiceForm/useInvoiceBookingPeriods";
import { bookingPeriodConflict } from "../../lib/originalBookingPeriod";
import { invoiceKeys } from "../../lib/queryKeys";

const tables = ["invoices", "invoice_bookings", "booking_extensions", "return_inspections"] as const;
type Table = typeof tables[number];
const selections: Record<Table, string> = {
  invoices: "id,booking_id,status,line_items,moneda,billing_period_start,billing_period_end",
  invoice_bookings: "invoice_id,booking_id,invoices!inner(status,line_items,moneda,billing_period_start,billing_period_end)",
  booking_extensions: "booking_id,original_end_date,new_end_date,invoice_id,pending_invoice_id",
  return_inspections: "booking_id,forklift_id,inspected_at",
};
const invoice = (id: number) => ({
  id: `invoice-${id}`, booking_id: `booking-${id}`, status: "draft", moneda: "USD",
  billing_period_start: "2026-10-01", billing_period_end: "2026-10-31",
  line_items: [{ line_kind: "rental", description: "Renta ficticia íntegra", quantity: 1, unit_price: 1234.56,
    total: 1234.56, tax_rate: 16, clave_prod_serv: "72141700", clave_unidad: "E48", objeto_imp: "02" }],
});
function fixtureRow(table: Table, id: number) {
  if (table === "invoices") return invoice(id);
  if (table === "invoice_bookings") {
    const { id: invoiceId, booking_id, ...fields } = invoice(id);
    return { invoice_id: invoiceId, booking_id, invoices: fields };
  }
  if (table === "booking_extensions") return { booking_id: `booking-${id}`, original_end_date: "2026-10-31", new_end_date: "2026-11-01", invoice_id: null, pending_invoice_id: null };
  return { booking_id: `booking-${id}`, forklift_id: `forklift-${id}`, inspected_at: "2026-10-31T18:00:00Z" };
}
interface RequestRecord { table: Table; offset: number; signal: AbortSignal; url: URL }
let requests: RequestRecord[];
let responseBytes: number;
let clients: QueryClient[];
beforeEach(() => { transport.mockReset(); requests = []; responseBytes = 0; clients = []; });
afterEach(() => { clients.forEach((client) => client.clear()); });
function context() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}
function installTransport(rowsPerTable: number, options: { pauseAt?: number; failTable?: Table } = {}) {
  transport.mockImplementation(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1) as Table;
    expect(tables).toContain(table);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const signal = init.signal as AbortSignal;
    requests.push({ table, offset, signal, url });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(url.searchParams.get("select")).toBe(selections[table]);
    if (options.pauseAt === offset) {
      await new Promise<void>((_resolve, reject) => {
        const abort = () => reject(new DOMException("Fixture transport cancelled", "AbortError"));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
    }
    const failed = table === options.failTable && offset > 0;
    const count = Math.max(0, Math.min(1000, rowsPerTable - offset));
    const body = JSON.stringify(failed ? { message: "page two unavailable", code: "TEST" }
      : Array.from({ length: count }, (_, index) => fixtureRow(table, offset + index)));
    responseBytes += new TextEncoder().encode(body).byteLength;
    return new Response(body, { status: failed ? 500 : 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("real query and PostgREST cancellation boundary", () => {
  it.each([0, 1000])("unmount aborts every active transport at offset %i and starts no next pages", async (offset) => {
    installTransport(3001, { pauseAt: offset });
    const { wrapper, client } = context();
    const view = renderHook(() => useBookingBillingEvidence(), { wrapper });
    await waitFor(() => expect(requests.filter((request) => request.offset === offset)).toHaveLength(4));
    const active = requests.filter((request) => request.offset === offset);
    expect(active.every((request) => !request.signal.aborted)).toBe(true);
    await act(async () => { view.unmount(); });
    await waitFor(() => expect(active.every((request) => request.signal.aborted)).toBe(true));
    expect(requests).toHaveLength(offset === 0 ? 4 : 8);
    expect(requests.every((request) => request.offset <= offset)).toBe(true);
    expect(client.getQueryData([...invoiceKeys.lists(), "booking-period-claims"])).toBeUndefined();
  });

  it("keeps complete fiscal lines and both links beyond the first page, with identical key/filter scope", async () => {
    installTransport(1001);
    const { wrapper, client } = context();
    const { result } = renderHook(() => useBookingBillingEvidence(), { wrapper });
    await waitFor(() => expect(result.current.claims.isSuccess && result.current.extensions.isSuccess && result.current.returns.isSuccess).toBe(true));
    expect(requests).toHaveLength(8);
    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      [...invoiceKeys.lists(), "booking-period-claims"], ["bookings", "billing-extension-history"], ["bookings", "billing-return-history"],
    ]);
    const { id, booking_id, ...fields } = invoice(1000);
    expect(result.current.claims.data?.filter((claim) => claim.booking_id === booking_id)).toEqual([
      { id, booking_id, ...fields, invoice_id: id }, { ...fields, booking_id, invoice_id: id },
    ]);
    expect(bookingPeriodConflict(booking_id, "2026-10-01", "2026-10-31", result.current.claims.data!)).toBe(true);
    for (const request of requests) {
      if (request.table === "invoices") {
        expect(request.url.searchParams.get("booking_id")).toBe("not.is.null");
        expect(request.url.searchParams.get("status")).toBe("neq.cancelled");
        expect(request.url.searchParams.get("order")).toBe("id.asc");
      } else if (request.table === "invoice_bookings") {
        expect(request.url.searchParams.get("invoices.status")).toBe("neq.cancelled");
        expect(request.url.searchParams.get("order")).toBe("invoice_id.asc,booking_id.asc");
      } else expect(request.url.searchParams.get("order")).toBe("id.asc");
    }
  });

  it.each(["invoices", "invoice_bookings", "booking_extensions"] as const)("a partial %s error keeps the actual form projection closed", async (failTable) => {
    installTransport(1001, { failTable });
    const { wrapper } = context();
    const { result } = renderHook(() => useInvoiceBookingPeriods({
      bookings: [{ id: "booking-1000", forklift_id: "forklift-1000", start_date: "2026-10-01", end_date: "2026-10-31", status: "confirmed" }],
      isEdit: false, extensionId: null, existing: null, existingBookingIds: [],
    }), { wrapper });
    await waitFor(() => expect(result.current.block).toMatch(/No se pudo verificar/));
    expect(result.current.ready).toBe(false);
    expect(result.current.candidates).toEqual([]);
    expect(result.current.handlerBookings).toBeUndefined();
    expect(result.current.linkedBlock(["booking-1000"])).toMatch(/No se pudo verificar/);
    expect(result.current.linkedBlock([])).toBeNull();
  });

  it("a partial return-history failure blocks the completed recurring booking, not unrelated invoices", async () => {
    installTransport(1001, { failTable: "return_inspections" });
    const { wrapper } = context();
    const { result } = renderHook(() => useInvoiceBookingPeriods({
      bookings: [
        { id: "selected-return", forklift_id: "f-selected", start_date: "2026-10-01", end_date: "2026-10-31", status: "completed", recurring_billing: true },
        { id: "unrelated", forklift_id: "f-other", start_date: "2026-10-01", end_date: "2026-10-31", status: "confirmed" },
      ],
      isEdit: false, extensionId: null, existing: null, existingBookingIds: [],
    }), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.candidates?.map((booking) => booking.id)).toEqual(["unrelated"]);
    expect(result.current.linkedBlock(["selected-return"])).toMatch(/devolución efectiva/);
    expect(result.current.linkedBlock(["unrelated"])).toBeNull();
  });

  it.each([1, 100, 1000, 1001, 5001])("records synthetic request/body/time cost for %i rows per source", async (rowsPerSource) => {
    installTransport(rowsPerSource);
    const { wrapper } = context();
    const start = performance.now();
    const { result } = renderHook(() => useBookingBillingEvidence(), { wrapper });
    await waitFor(() => expect(result.current.claims.isSuccess && result.current.extensions.isSuccess && result.current.returns.isSuccess).toBe(true));
    const elapsedMs = Number((performance.now() - start).toFixed(3));
    expect(requests).toHaveLength(4 * (Math.floor(rowsPerSource / 1000) + 1));
    expect(result.current.claims.data).toHaveLength(rowsPerSource * 2);
    // eslint-disable-next-line no-console -- Synthetic audit output, not production telemetry.
    console.info(`BILLING_READ_FIXTURE ${JSON.stringify({ rowsPerSource, requests: requests.length, responseBytes, elapsedMs })}`);
  });
});
