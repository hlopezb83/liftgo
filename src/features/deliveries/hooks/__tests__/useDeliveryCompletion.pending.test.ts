import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeliveryCompletion } from "../useDeliveryCompletion";

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null }) }));
vi.mock("../useDeliveries", () => ({
  deliveryKeys: { all: ["deliveries"] },
  useCompleteDelivery: () => mutation,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const delivery = {
  id: "delivery-1", forklift_id: "forklift-1", type: "delivery",
  booking_id: null, hours_reading: null,
} as NonNullable<Parameters<typeof useDeliveryCompletion>[0]>;

beforeEach(() => {
  vi.clearAllMocks();
  mutation.isPending = false;
});

describe("useDeliveryCompletion: una mutación a la vez", () => {
  it("evita dos envíos antes de que React Query cambie a pendiente", () => {
    const { result } = renderHook(() => useDeliveryCompletion(delivery, [], null, undefined));
    act(() => {
      result.current.markComplete("test-signature");
      result.current.markComplete("test-signature");
    });
    expect(mutation.mutate).toHaveBeenCalledOnce();
  });

  it("permite reintentar después de terminar la mutación anterior", () => {
    const { result } = renderHook(() => useDeliveryCompletion(delivery, [], null, undefined));
    act(() => result.current.markComplete("test-signature"));
    act(() => mutation.mutate.mock.calls[0][1].onSettled());
    act(() => result.current.markComplete("test-signature"));
    expect(mutation.mutate).toHaveBeenCalledTimes(2);
  });

  it("expone el estado pendiente e impide otro envío", () => {
    mutation.isPending = true;
    const { result } = renderHook(() => useDeliveryCompletion(delivery, [], null, undefined));
    expect(result.current.isPending).toBe(true);
    act(() => result.current.markComplete("test-signature"));
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
});
