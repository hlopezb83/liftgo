import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useAddMaintenancePart — v7.93.0+:
 *   El stock de parts_inventory y el `cost` agregado en maintenance_logs
 *   los recalculan triggers en el servidor (BL-28/29). El hook sólo debe
 *   insertar la fila en maintenance_parts.
 *
 *   - No debe escribir en maintenance_logs desde el cliente.
 *   - `currentLogCost` (metadato UI) NO debe persistirse.
 *   - Errores de insert se propagan con notifyError.
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const partInserts: unknown[] = [];
const logCalls: Array<{ method: string; args: unknown[] }> = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "mp-1" },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      maintenance_parts: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) {
          partInserts.push(ins.args[0]);
          return insertResp;
        }
        return { data: null, error: null };
      },
      maintenance_logs: (calls) => {
        for (const c of calls) logCalls.push(c);
        return { data: null, error: null };
      },
    },
  }),
}));

import { useAddMaintenancePart } from "../usePartInventoryMutations";

beforeEach(() => {
  partInserts.length = 0;
  logCalls.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "mp-1" }, error: null };
});

describe("useAddMaintenancePart", () => {
  it("inserta la pieza sin escribir en maintenance_logs (lo hacen los triggers)", async () => {
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

    expect(partInserts[0]).toMatchObject({
      maintenance_log_id: "log-1",
      part_id: "p-1",
      quantity_used: 3,
      cost_at_time: 250,
    });
    // currentLogCost es metadato UI, no debe persistirse.
    expect((partInserts[0] as Record<string, unknown>).currentLogCost).toBeUndefined();
    // El cliente ya no toca maintenance_logs — lo hace el trigger.
    expect(logCalls).toHaveLength(0);
  });

  it("omite currentLogCost aunque cost_at_time sea undefined", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenancePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        maintenance_log_id: "log-1",
        part_id: "p-1",
        quantity_used: 2,
      } as never);
    });

    expect((partInserts[0] as Record<string, unknown>).currentLogCost).toBeUndefined();
    expect(logCalls).toHaveLength(0);
  });

  it("propaga error del insert vía notifyError", async () => {
    insertResp = { data: null, error: { message: "fk part_id" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenancePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ maintenance_log_id: "log-1", part_id: "x", quantity_used: 1 } as never)
        .catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(logCalls).toHaveLength(0);
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al agregar refacción",
    });
  });
});
