import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

const h = vi.hoisted(() => ({ state: { calls: [] as ChainCall[] } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      deliveries: (calls) => {
        h.state.calls = calls;
        return { data: { hours_reading: 120 }, error: null };
      },
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useDeliveryCompletion } from "../useDeliveryCompletion";

type AnyDelivery = Parameters<typeof useDeliveryCompletion>[0];

const delivery = {
  id: "d-1",
  forklift_id: "f-1",
  type: "pickup",
  status: "scheduled",
  hours_reading: null,
} as unknown as AnyDelivery;

describe("useDeliveryCompletion · última lectura global (FIX-R3-02)", () => {
  it("excluye entregas canceladas y sin completed_at", async () => {
    const { Wrapper } = createQueryWrapper();
    renderHook(() => useDeliveryCompletion(delivery, [], null, undefined), { wrapper: Wrapper });
    await waitFor(() => expect(h.state.calls.length).toBeGreaterThan(0));

    const notCalls = h.state.calls.filter((c) => c.method === "not");
    const neqCalls = h.state.calls.filter((c) => c.method === "neq");

    expect(notCalls).toContainEqual({ method: "not", args: ["completed_at", "is", null] });
    expect(notCalls).toContainEqual({ method: "not", args: ["hours_reading", "is", null] });
    expect(neqCalls).toContainEqual({ method: "neq", args: ["status", "cancelled"] });
  });

  it("filtra por la unidad y ordena por completed_at descendente", async () => {
    const { Wrapper } = createQueryWrapper();
    renderHook(() => useDeliveryCompletion(delivery, [], null, undefined), { wrapper: Wrapper });
    await waitFor(() => expect(h.state.calls.length).toBeGreaterThan(0));

    expect(h.state.calls).toContainEqual({ method: "eq", args: ["forklift_id", "f-1"] });
    const order = h.state.calls.find((c) => c.method === "order");
    expect(order?.args[0]).toBe("completed_at");
  });
});
