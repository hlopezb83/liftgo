import { QueryObserver } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryBookingDateError } from "@/features/deliveries/lib/deliveryBookingDate";
import { e2eVisibilityFilter } from "@/lib/supabase/constants";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { bookingKeys } from "../../lib/queryKeys";
import { useCancelBooking, useCreateBooking, useDeleteBooking, useUpdateBooking } from "../bookings/useBookingMutations";
import { useConfirmedBookingsForDelivery } from "../bookings/useBookings";

const server = vi.hoisted(() => ({
  rows: [{ id: "booking-1", customer_name: "QA", start_date: "2026-10-23", end_date: "2026-10-30", forklift_id: "forklift-1", status: "confirmed" }],
  reads: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      let updates: Record<string, unknown> = {};
      let id: string | undefined;
      const query = {
        update: (value: Record<string, unknown>) => { updates = value; return query; },
        eq: (field: string, value: string) => { if (field === "id") id = value; return query; },
        select: () => query,
        or: () => query,
        order: () => query,
        range: () => query,
        returns: async () => {
          server.reads();
          return { data: server.rows.filter((row) => row.status === "confirmed").map((row) => ({ ...row })), error: null };
        },
        then: (resolve: (value: unknown) => void) => {
          server.rows = server.rows.map((row) => row.id === id ? { ...row, ...updates } : row);
          resolve({ data: server.rows.filter((row) => row.id === id), error: null });
        },
      };
      return query;
    }),
    rpc: vi.fn(async (name: string, args: Record<string, string>) => {
      if (name === "cancel_booking") server.rows = server.rows.map((row) => row.id === args.p_booking_id ? { ...row, status: "cancelled" } : row);
      if (name === "delete_booking") server.rows = server.rows.filter((row) => row.id !== args.p_booking_id);
      if (name === "create_booking") server.rows.push({ id: "booking-2", customer_name: "QA nueva", start_date: args.p_start_date, end_date: args.p_end_date, forklift_id: args.p_forklift_id, status: "confirmed" });
      return { data: "booking-2", error: null };
    }),
  },
}));
vi.mock("@/features/deliveries", () => ({ deliveryKeys: { all: ["deliveries"] } }));
vi.mock("@/features/quotes", () => ({ quoteKeys: { all: ["quotes"] } }));
vi.mock("@/features/fleet", () => ({ forkliftKeys: { lists: () => ["forklifts", "list"] } }));
vi.mock("@/features/reports", () => ({ reportKeys: { all: ["reports"] } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn() }));

const disposals: (() => void)[] = [];
beforeEach(() => {
  server.rows = [{ id: "booking-1", customer_name: "QA", start_date: "2026-10-23", end_date: "2026-10-30", forklift_id: "forklift-1", status: "confirmed" }];
  server.reads.mockClear();
});
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()));

async function setup() {
  const { Wrapper, queryClient } = createQueryWrapper();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 60_000, gcTime: Infinity } });
  const unrelatedFetch = vi.fn(async () => "unchanged");
  const unrelatedKey = bookingKeys.auditLogs("another-booking");
  queryClient.setQueryData(unrelatedKey, "unchanged");
  const observer = new QueryObserver(queryClient, { queryKey: unrelatedKey, queryFn: unrelatedFetch, staleTime: Infinity });
  disposals.push(observer.subscribe(() => {}));
  const hook = renderHook(({ open }) => ({
    selector: useConfirmedBookingsForDelivery(open),
    update: useUpdateBooking(), cancel: useCancelBooking(),
    create: useCreateBooking(), remove: useDeleteBooking(),
  }), { wrapper: Wrapper, initialProps: { open: true } });
  disposals.push(() => hook.unmount(), () => queryClient.clear());
  await waitFor(() => expect(hook.result.current.selector.isSuccess).toBe(true));
  expect(server.reads).toHaveBeenCalledTimes(1);
  return { ...hook, queryClient, unrelatedFetch };
}

describe("D1: booking mutations refresh the real delivery selector", () => {
  it("renews dates and equipment in a mounted selector without refetching unrelated histories", async () => {
    const { result, unrelatedFetch } = await setup();
    await act(async () => {
      await result.current.update.mutateAsync({ id: "booking-1", start_date: "2026-11-01", end_date: "2026-11-10", forklift_id: "forklift-2" });
    });
    await waitFor(() => expect(result.current.selector.data?.pages[0][0]).toMatchObject({ start_date: "2026-11-01", end_date: "2026-11-10", forklift_id: "forklift-2" }));
    const booking = result.current.selector.data!.pages[0][0];
    expect(deliveryBookingDateError("delivery", "2026-10-23", booking)).toBeTruthy();
    expect(deliveryBookingDateError("delivery", "2026-11-01", booking)).toBeNull();
    expect(server.reads).toHaveBeenCalledTimes(2);
    expect(unrelatedFetch).not.toHaveBeenCalled();
  });

  it("refetches immediately on reopening a recently closed selector, for every visibility variant", async () => {
    const { result, rerender, queryClient } = await setup();
    const otherVisibility = bookingKeys.deliveryConfirmed("other-visibility");
    queryClient.setQueryData(otherVisibility, { pages: [server.rows], pageParams: [0] });
    rerender({ open: false });
    await act(async () => {
      await result.current.update.mutateAsync({ id: "booking-1", start_date: "2026-11-01", forklift_id: "forklift-2" });
    });
    expect(server.reads).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(bookingKeys.deliveryConfirmed(e2eVisibilityFilter()))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherVisibility)?.isInvalidated).toBe(true);
    rerender({ open: true });
    await waitFor(() => expect(result.current.selector.data?.pages[0][0]).toMatchObject({ start_date: "2026-11-01", forklift_id: "forklift-2" }));
    expect(server.reads).toHaveBeenCalledTimes(2);
  });

  it.each(["cancel", "remove"] as const)("removes the booking from the active selector after %s", async (mutation) => {
    const { result } = await setup();
    await act(async () => { await result.current[mutation].mutateAsync("booking-1"); });
    await waitFor(() => expect(result.current.selector.data?.pages[0]).toEqual([]));
    expect(server.reads).toHaveBeenCalledTimes(2);
  });

  it("includes a newly created confirmed booking without waiting for staleTime", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.create.mutateAsync({ forklift_id: "forklift-2", start_date: "2026-11-01", end_date: "2026-11-10" });
    });
    await waitFor(() => expect(result.current.selector.data?.pages[0].map((row) => row.id)).toEqual(["booking-1", "booking-2"]));
  });
});
