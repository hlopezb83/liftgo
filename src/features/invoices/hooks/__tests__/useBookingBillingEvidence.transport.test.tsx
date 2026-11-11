import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => "org-a" }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => "actor-a:org-a" }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://billing-evidence.invalid", "offline-fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  }) };
});
import { useBookingBillingEvidence } from "../invoices/useBookingBillingEvidence";
import { useInvoiceBookingPeriods } from "../invoiceForm/useInvoiceBookingPeriods";

const invoice = (id: number) => ({
  id: `invoice-${id}`, booking_id: `booking-${id}`, status: "draft", moneda: "USD",
  occupies_booking_period: true,
  billing_period_start: "2026-10-01", billing_period_end: "2026-10-31",
  line_items: [{ line_kind: "rental", description: "Renta ficticia íntegra", quantity: 1, unit_price: 1234.56,
    total: 1234.56, tax_rate: 16, clave_prod_serv: "72141700", clave_unidad: "E48", objeto_imp: "02" }],
});
let clients: QueryClient[];
beforeEach(() => { transport.mockReset(); clients = []; });
afterEach(() => { clients.forEach((client) => client.clear()); });
function context() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}
function scopedTransport(response: unknown, status = 200) {
  transport.mockImplementation(async (input: string, init: RequestInit) => {
    expect(new URL(input).pathname).toBe("/rest/v1/rpc/get_invoice_booking_billing_evidence_v2");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return new Response(JSON.stringify(response), { status, headers: { "Content-Type": "application/json" } });
  });
}

describe("real query and PostgREST cancellation boundary", () => {
  it("aborts the scoped RPC on unmount and exposes no partial evidence", async () => {
    let signal: AbortSignal | undefined;
    transport.mockImplementation(async (_input: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      await new Promise<void>((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
      });
    });
    const { wrapper, client } = context();
    const view = renderHook(() => useBookingBillingEvidence(["booking-1"]), { wrapper });
    await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
    view.unmount();
    expect(signal?.aborted).toBe(true);
    expect(client.getQueryCache().getAll().every((query) => query.state.data === undefined)).toBe(true);
    expect(transport).toHaveBeenCalledOnce();
  });

  it.each(["error", "missing booking", "orphan invoice"] as const)("scoped %s keeps the actual form projection closed", async (failure) => {
    const { booking_id: _bookingId, ...orphan } = invoice(1000);
    scopedTransport(failure === "error" ? { message: "history unavailable", code: "TEST" } : {
      bookingIds: failure === "missing booking" ? [] : ["booking-1000"],
      invoices: failure === "orphan invoice" ? [orphan] : [], claims: [], extensions: [], returns: [],
    }, failure === "error" ? 500 : 200);
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
    expect(transport).toHaveBeenCalledOnce();
  });

  it("missing return evidence blocks the completed recurring booking, not unrelated invoices", async () => {
    scopedTransport({ bookingIds: ["selected-return", "unrelated"], invoices: [], claims: [], extensions: [], returns: [] });
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

  it("shares a single scoped request across the three views and preserves other bookings linked to the invoice", async () => {
    const { id, booking_id, ...fields } = invoice(1000);
    scopedTransport({ bookingIds: [booking_id], invoices: [{ id, ...fields }],
      claims: [{ invoice_id: id, booking_id }, { invoice_id: id, booking_id: "other-page" }], extensions: [], returns: [] });
    const { wrapper } = context();
    const { result } = renderHook(() => useBookingBillingEvidence([booking_id, booking_id]), { wrapper });
    await waitFor(() => expect(result.current.claims.isSuccess && result.current.extensions.isSuccess && result.current.returns.isSuccess).toBe(true));
    expect(transport).toHaveBeenCalledOnce();
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({ p_expected_organization_id: "org-a", p_booking_ids: [booking_id] });
    expect(result.current.claims.data?.map((claim) => claim.booking_id)).toEqual([booking_id, "other-page"]);
    expect(result.current.claims.data?.[1].line_items).toEqual(fields.line_items);
    await act(async () => {
      await Promise.all([result.current.claims.refetch({ cancelRefetch: false }),
        result.current.extensions.refetch({ cancelRefetch: false }), result.current.returns.refetch({ cancelRefetch: false })]);
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
