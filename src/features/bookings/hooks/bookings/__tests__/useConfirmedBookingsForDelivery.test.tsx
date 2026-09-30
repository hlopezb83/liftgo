import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useConfirmedBookingsForDelivery } from "../useBookings";

const state = vi.hoisted(() => ({ statusFiltered: true }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseChainMock } = await import("@/test/helpers/supabaseChain");
  const rows = Array.from({ length: 601 }, (_, index) => ({
    id: `booking-${index}`, customer_name: `Cliente ${index}`,
    start_date: "2026-09-01", end_date: "2026-09-02", forklift_id: "forklift-1", status: "confirmed",
  }));
  return { supabase: createSupabaseChainMock({ tableResolvers: {
    bookings: (calls) => {
      state.statusFiltered &&= calls.some((call) => call.method === "eq" && call.args[0] === "status" && call.args[1] === "confirmed");
      const range = calls.find((call) => call.method === "range")?.args ?? [0, 100];
      return { data: rows.slice(Number(range[0]), Number(range[1]) + 1), error: null };
    },
  } }) };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useConfirmedBookingsForDelivery", () => {
  it("keeps a confirmed booking beyond row 501 reachable", async () => {
    state.statusFiltered = true;
    const { result } = renderHook(() => useConfirmedBookingsForDelivery(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    while (result.current.hasNextPage) {
      await act(async () => { await result.current.fetchNextPage(); });
    }
    const bookings = result.current.data?.pages.flatMap((page) => page.slice(0, 100)) ?? [];
    expect(bookings).toHaveLength(601);
    expect(bookings.at(-1)?.id).toBe("booking-600");
    expect(state.statusFiltered).toBe(true);
  });
});
