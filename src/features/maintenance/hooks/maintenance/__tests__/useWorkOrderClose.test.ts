import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";
import { useCloseWorkOrder } from "../useWorkOrderClose";

const { updated } = vi.hoisted(() => ({ updated: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      maintenance_logs: (calls) => {
        updated(calls.find((call) => call.method === "update")?.args[0]);
        return { data: { id: "ot-a", work_status: "completed", cost: 650 }, error: null };
      },
    },
  }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

describe("cerrar OT refresca disponibilidad y resúmenes", () => {
  it("invalida inmediatamente la flota, indicadores, calendario y costos del equipo", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const dependentQueries = [
      ["forklifts", "org-a"], ["status_logs", "fork-a"],
      ["sidebar-badge-counts", "user-a", "org-a"],
      ["dashboard-stats", "org-a"], ["fleet_locations", "org-a"],
      ["forklift-location", "fork-a"], ["forklift-financials", "fork-a"],
      ["calendar-maintenance-windows", "2026-09-01", "2026-09-30"],
      ["damage_records", "org-a"],
    ];
    dependentQueries.forEach((key) => queryClient.setQueryData(key, { stale: true }));
    const { result } = renderHook(() => useCloseWorkOrder(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "ot-a", performedAt: "2026-09-30", description: null });
    });
    expect(updated).toHaveBeenCalledWith({ work_status: "completed", performed_at: "2026-09-30" });
    dependentQueries.forEach((key) => expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true));
  });
});
