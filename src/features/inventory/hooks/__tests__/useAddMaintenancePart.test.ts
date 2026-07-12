import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useAddMaintenancePart — flujo compuesto:
 *   1) insert en maintenance_parts
 *   2) update del cost agregado en maintenance_logs (currentLogCost + qty * cost)
 *
 * Riesgo crítico: si el update falla, la pieza queda registrada pero el costo
 * total NO se refleja → reporte ROI por equipo subestimado.
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const partInserts: unknown[] = [];
const logUpdates: Array<{ patch: unknown; eqArgs: unknown[] }> = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "mp-1" },
  error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: [{ id: "log-1" }],
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      maintenance_parts: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { partInserts.push(ins.args[0]); return insertResp; }
        return { data: null, error: null };
      },
      maintenance_logs: (calls) => {
        const upd = calls.find((c) => c.method === "update");
        if (upd) {
          const eq = calls.find((c) => c.method === "eq");
          logUpdates.push({ patch: upd.args[0], eqArgs: eq?.args ?? [] });
          return updateResp;
        }
        return { data: null, error: null };
      },
    },
  }),
}));

import { useAddMaintenancePart } from "../usePartInventoryMutations";

beforeEach(() => {
  partInserts.length = 0;
  logUpdates.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "mp-1" }, error: null };
  updateResp = { data: [{ id: "log-1" }], error: null };
});

describe("useAddMaintenancePart", () => {
  it("inserta la pieza y actualiza el costo del log: currentLogCost + qty * cost", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenancePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        maintenance_log_id: "log-1",
        part_id: "p-1",
        quantity_used: 3,
        cost_at_time: 250,
        currentLogCost: 1_000,
      } as never);
    });

    // currentLogCost NO debe persistirse en maintenance_parts
    expect(partInserts[0]).toMatchObject({
      maintenance_log_id: "log-1",
      quantity_used: 3,
      cost_at_time: 250,
    });
    expect((partInserts[0] as Record<string, unknown>).currentLogCost).toBeUndefined();

    // 1_000 + (3 * 250) = 1_750
    expect(logUpdates[0].patch).toEqual({ cost: 1_750 });
  });

  it("usa cero por default si currentLogCost/cost_at_time son undefined", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenancePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        maintenance_log_id: "log-1",
        part_id: "p-1",
        quantity_used: 2,
      } as never);
    });

    // 0 + (2 * 0) = 0
    expect(logUpdates[0].patch).toEqual({ cost: 0 });
  });

  it("propaga error del insert sin tocar maintenance_logs", async () => {
    insertResp = { data: null, error: { message: "fk part_id" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenancePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ maintenance_log_id: "log-1", part_id: "x", quantity_used: 1 } as never)
        .catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(logUpdates).toHaveLength(0);
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al agregar refacción",
    });
  });

  it("falla si el update de maintenance_logs afecta cero filas (assertRowsAffected)", async () => {
    updateResp = { data: [], error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenancePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({
          maintenance_log_id: "ghost-log",
          part_id: "p-1",
          quantity_used: 1,
          cost_at_time: 100,
          currentLogCost: 0,
        } as never)
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
