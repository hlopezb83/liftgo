import { QueryObserver } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompleteDelivery } from "@/features/deliveries/hooks/useDeliveries";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useCreateReturnInspection } from "../useReturnInspections";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: { id: "completed-1" }, error: null });
});

const cases = [
  { name: "entrega", useHook: useCompleteDelivery, input: { id: "delivery-1" } },
  { name: "devolución", useHook: useCreateReturnInspection, input: { booking_id: "booking-1", forklift_id: "forklift-1", fuel_level: "full" } },
] as const;

describe.each(cases)("Refresco después de $name", ({ useHook, input }) => {
  it("refresca el panel y las ubicaciones aunque sus consultas estén frescas", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const keys = [["dashboard-stats", "list", { dateKey: "2026-09-27" }], ["fleet_locations", "list"], ["forklift-location", "detail", "forklift-1"]] as const;
    let serverRevision = "before";
    const observers = keys.map((queryKey) => {
      queryClient.setQueryData(queryKey, "before");
      return new QueryObserver(queryClient, { queryKey, staleTime: Infinity, queryFn: async () => serverRevision });
    });
    const unsubscribe = observers.map((observer) => observer.subscribe(() => {}));
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper });
    serverRevision = "after";
    try {
      await act(async () => { await result.current.mutateAsync(input as never); });
      for (const key of keys) expect(queryClient.getQueryData(key)).toBe("after");
    } finally {
      unsubscribe.forEach((stop) => stop());
      queryClient.clear();
    }
  });

  it("marca para recarga las vistas desmontadas y conserva consultas ajenas", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const roots = ["dashboard-stats", "fleet_locations", "forklift-location", "bookings", "forklifts", "status_logs"];
    for (const root of roots) queryClient.setQueryData([root, "list"], "before");
    queryClient.setQueryData(["customers", "list"], "unchanged");
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper });
    await act(async () => { await result.current.mutateAsync(input as never); });
    for (const root of roots) expect(queryClient.getQueryState([root, "list"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["customers", "list"])?.isInvalidated).toBe(false);
  });

  it("conserva la caché si el servidor rechaza la transición", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const key = ["dashboard-stats", "list"];
    queryClient.setQueryData(key, "before");
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Transición rechazada") });
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper });
    await act(async () => { await expect(result.current.mutateAsync(input as never)).rejects.toThrow("Transición rechazada"); });
    expect(queryClient.getQueryData(key)).toBe("before");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  });
});
