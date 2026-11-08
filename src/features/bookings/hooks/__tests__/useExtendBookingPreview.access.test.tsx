import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@/lib/domain/roles";
import { customerKeys } from "@/features/customers/lib/queryKeys";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";
import type { BookingWithForklift } from "../bookings/useBookings";

const state = vi.hoisted(() => ({
  role: { data: "admin" as AppRole | null | undefined, isLoading: false, isError: false },
  read: vi.fn(),
}));
vi.mock("@/features/users/hooks/useUserRole", () => ({ useUserRole: () => state.role }));
// Keep the production financial-permission policy, not a canned preview or gate.
vi.mock("@/features/users", async () => ({
  ...await vi.importActual("@/features/users/hooks/useHasModuleAccess"),
}));
vi.mock("@/features/fleet", () => ({ useForklifts: () => ({ data: [{
  id: "forklift-1", name: "Synthetic", daily_rate: 100, weekly_rate: null, monthly_rate: null,
}] }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: { organization_customers: (calls) => state.read(calls) } }),
}));

import { supabase } from "@/integrations/supabase/client";
import { useExtendBookingPreview } from "../bookingActions/useExtendBookingPreview";

const booking = { id: "booking-1", customer_id: "customer-1", forklift_id: "forklift-1",
  start_date: "2026-10-01", end_date: "2026-10-15" } as BookingWithForklift;
const date = new Date("2026-10-16T12:00:00");
const relation = { status: "active", organization_id: "current-company", tax_rate: 0,
  customers: { id: "customer-1", name: "Shared identity", created_by_organization_id: "other-company", tax_rate: 16 } };

beforeEach(() => {
  vi.clearAllMocks();
  state.role = { data: "admin", isLoading: false, isError: false };
  state.read.mockResolvedValue({ data: relation, error: null });
});
afterEach(cleanup);

function renderPreview() {
  const { Wrapper, queryClient } = createQueryWrapper();
  return { ...renderHook(() => useExtendBookingPreview(booking, date), { wrapper: Wrapper }), queryClient };
}

describe("extension preview with real customer query and financial gate", () => {
  it.each([
    { data: "dispatcher" as AppRole, isLoading: false, isError: false },
    { data: null, isLoading: false, isError: false },
    { data: undefined, isLoading: true, isError: false },
    { data: "admin" as AppRole, isLoading: true, isError: false },
    { data: "admin" as AppRole, isLoading: false, isError: true },
  ])("does not read fiscal data or estimate when role is $data / loading=$isLoading / error=$isError", async (role) => {
    state.role = role;
    const { result } = renderPreview();
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(state.read).not.toHaveBeenCalled();
  });

  it("does not use cached fiscal data without financial permission", () => {
    state.role.data = "dispatcher";
    const { Wrapper, queryClient } = createQueryWrapper();
    queryClient.setQueryData(customerKeys.detail(booking.customer_id!), { id: booking.customer_id, tax_rate: 8 });
    const { result } = renderHook(() => useExtendBookingPreview(booking, date), { wrapper: Wrapper });
    expect(result.current).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each([0, 8, 16, null, undefined])("takes rate %s from the active organization relation, not global identity", async (rate) => {
    state.read.mockResolvedValue({ data: { ...relation, tax_rate: rate }, error: null });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current?.taxRate).toBe(rate ?? 16));
    expect(result.current?.subtotal).toBe(100);
    expect(result.current?.taxAmount).toBe(rate ?? 16);
    expect(supabase.from).toHaveBeenCalledWith("organization_customers");
    const calls = state.read.mock.calls[0][0] as ChainCall[];
    expect(calls).toContainEqual({ method: "eq", args: ["customer_id", "customer-1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({ method: "is", args: ["customers.deleted_at", null] });
  });

  it("does not estimate when the server hides a customer without an active relation", async () => {
    state.read.mockResolvedValue({ data: null, error: null });
    const { result, queryClient } = renderPreview();
    await waitFor(() => expect(queryClient.getQueryState(customerKeys.detail("customer-1"))?.status).toBe("success"));
    expect(result.current).toBeNull();
  });

  it("does not expose an in-flight fiscal response after financial access is lost", async () => {
    let resolve!: (response: SupabaseMockResponse) => void;
    state.read.mockReturnValue(new Promise<SupabaseMockResponse>((done) => { resolve = done; }));
    const { result, rerender } = renderPreview();
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    state.role.data = "dispatcher";
    rerender();
    await act(async () => resolve({ data: relation, error: null }));
    expect(result.current).toBeNull();
    expect(state.read).toHaveBeenCalledOnce();
  });
});
