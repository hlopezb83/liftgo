import { QueryObserver } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliveryQueries } from "@/features/deliveries/hooks/useDeliveries";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { bookingKeys } from "../../lib/queryKeys";
import { useCancelBooking } from "../bookings/useBookingMutations";

const server = vi.hoisted(() => ({
  booking: "confirmed",
  transport: "scheduled",
  quote: "converted",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => {
      // Effects of cancel_booking + its converted quote rebound trigger.
      server.booking = "cancelled";
      server.transport = "cancelled";
      server.quote = "accepted";
      return { data: null, error: null };
    }),
  },
}));
vi.mock("@/features/fleet", () => ({
  forkliftKeys: {
    all: ["forklifts"],
    lists: () => ["forklifts", "list"],
  },
}));
vi.mock("@/features/reports", () => ({ reportKeys: { all: ["reports"] } }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((fn) => fn());
});

async function cancelWithMountedViews() {
  Object.assign(server, {
    booking: "confirmed",
    transport: "scheduled",
    quote: "converted",
  });
  const { Wrapper, queryClient } = createQueryWrapper();
  const keys = {
    booking: bookingKeys.detail("booking-1"),
    transport: deliveryQueries.list({ bookingId: "booking-1" }).queryKey,
    quote: createEntityKeys("quotes").detail("quote-1"),
  };
  for (const name of ["booking", "transport", "quote"] as const) {
    queryClient.setQueryData(keys[name], server[name]);
    const observer = new QueryObserver(queryClient, {
      queryKey: keys[name],
      staleTime: Infinity,
      queryFn: async () => server[name],
    });
    disposals.push(observer.subscribe(() => {}));
  }
  disposals.push(() => queryClient.clear());
  const { result } = renderHook(() => useCancelBooking(), { wrapper: Wrapper });
  await act(async () => {
    await result.current.mutateAsync({ bookingId: "booking-1" });
  });
  return { queryClient, keys };
}

describe("OP04: cancellation refreshes its actual dependent views", () => {
  it("control: booking status refreshes after cancellation succeeds", async () => {
    const { queryClient, keys } = await cancelWithMountedViews();
    expect(queryClient.getQueryData(keys.booking)).toBe("cancelled");
  });
  it("scheduled transport and converted quote do not remain visible after the server changed both", async () => {
    const { queryClient, keys } = await cancelWithMountedViews();
    expect({
      transport: queryClient.getQueryData(keys.transport),
      quote: queryClient.getQueryData(keys.quote),
    }).toEqual({ transport: "cancelled", quote: "accepted" });
  });
});
