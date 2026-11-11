import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";
import { TestRouter } from "@/test/router";
import { bookingKeys } from "../../lib/queryKeys";

const state = vi.hoisted(() => ({ read: vi.fn(), navigate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: { booking_extensions: () => state.read() } }),
}));
vi.mock("../../hooks/bookings/useBookings", () => ({ useBooking: () => ({ data: {
  id: "booking-1", booking_number: "SYNTHETIC", start_date: "2026-10-01", end_date: "2026-10-20",
  status: "confirmed", recurring_billing: false,
} }) }));
vi.mock("@/features/fleet", () => ({ forkliftKeys: { all: ["forklifts"] } }));
vi.mock("@/features/deliveries", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/deliveries")>(), deliveryQueries: { list: () => ({ queryKey: ["deliveries"], queryFn: async () => [] }) } }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true, useHasFinancialAccess: () => true }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => state.navigate }));
vi.mock("../../components/bookings/BookingActions", () => ({ BookingActions: () => null }));
vi.mock("../../components/bookings/BookingStatusHistory", () => ({ BookingStatusHistory: () => null }));
vi.mock("../../components/booking-detail/BookingBillingCard", () => ({ BookingBillingCard: () => null }));

import BookingDetail from "../BookingDetail";

const extension = { id: "extension-1", original_end_date: "2026-10-15", new_end_date: "2026-10-20",
  created_at: "2026-10-10T12:00:00Z", invoice_id: null, pending_invoice_id: null };

function renderCachedPage(stale = true) {
  const { queryClient } = createQueryWrapper();
  queryClient.setQueryData(bookingKeys.extensions("booking-1"), [extension], {
    updatedAt: Date.now() - (stale ? 120_000 : 0),
  });
  const view = render(<QueryClientProvider client={queryClient}>
    <TestRouter initialEntries={["/bookings/booking-1"]} path="/bookings/$id"><BookingDetail /></TestRouter>
  </QueryClientProvider>);
  return { ...view, queryClient };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("extension action while the production query refreshes cached rows", () => {
  it.each([true, false])("blocks cached unbilled data until pending draft arrives (stale=%s)", async (stale) => {
    let resolve!: (value: SupabaseMockResponse) => void;
    state.read.mockReturnValue(new Promise<SupabaseMockResponse>((done) => { resolve = done; }));
    renderCachedPage(stale);
    const button = await screen.findByRole("button", { name: /facturar extensión/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(state.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    await act(async () => resolve({ data: [{ ...extension, pending_invoice_id: "draft-1" }], error: null }));
    await screen.findByText("Pendiente de emisión");
    expect(screen.getByRole("button", { name: /facturar extensión/i })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: /facturar extensión/i }));
    expect(state.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /ver factura/i }));
    expect(state.navigate.mock.calls[0][0]).toBe("/invoices/draft-1");
  });

  it("keeps cached data blocked after an error, then enables only after successful retry", async () => {
    state.read.mockResolvedValue({ data: null, error: { message: "synthetic offline response" } });
    renderCachedPage();
    await screen.findByText("No se pudo verificar la facturación de las extensiones.");
    const button = screen.getByRole("button", { name: /facturar extensión/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(state.navigate).not.toHaveBeenCalled();
    state.read.mockResolvedValue({ data: [extension], error: null });
    fireEvent.click(screen.getByRole("button", { name: /reintentar verificación/i }));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(state.navigate).toHaveBeenCalledWith("/invoices/new?extension_id=extension-1");
  });

  it("blocks the action again during background invalidation after a successful read", async () => {
    state.read.mockResolvedValue({ data: [extension], error: null });
    const { queryClient } = renderCachedPage();
    const button = await screen.findByRole("button", { name: /facturar extensión/i });
    await waitFor(() => expect(button).toBeEnabled());
    let resolve!: (value: SupabaseMockResponse) => void;
    state.read.mockReturnValue(new Promise<SupabaseMockResponse>((done) => { resolve = done; }));
    act(() => { void queryClient.invalidateQueries({ queryKey: bookingKeys.extensions("booking-1") }); });
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(state.navigate).not.toHaveBeenCalled();
    await act(async () => resolve({ data: [{ ...extension, invoice_id: "issued-1" }], error: null }));
    await screen.findByText("Facturada");
    expect(screen.getByRole("button", { name: /facturar extensión/i })).toHaveAttribute("aria-disabled", "true");
  });
  it("keeps a paused refresh blocked until reconnection completes the verification", async () => {
    state.read.mockResolvedValue({ data: [extension], error: null });
    const { queryClient } = renderCachedPage();
    const button = await screen.findByRole("button", { name: /facturar extensión/i });
    await waitFor(() => expect(button).toBeEnabled());
    try {
      onlineManager.setOnline(false);
      act(() => { void queryClient.invalidateQueries({ queryKey: bookingKeys.extensions("booking-1") }); });
      await waitFor(() => expect(queryClient.getQueryState(bookingKeys.extensions("booking-1"))?.fetchStatus).toBe("paused"));
      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);
      expect(state.navigate).not.toHaveBeenCalled();
      let resolve!: (value: SupabaseMockResponse) => void;
      state.read.mockReturnValue(new Promise<SupabaseMockResponse>((done) => { resolve = done; }));
      state.read.mockClear();
      act(() => onlineManager.setOnline(true));
      await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
      expect(button).toBeDisabled();
      await act(async () => resolve({ data: [extension], error: null }));
      await waitFor(() => expect(button).toBeEnabled());
    } finally {
      onlineManager.setOnline(true);
    }
  });

});
