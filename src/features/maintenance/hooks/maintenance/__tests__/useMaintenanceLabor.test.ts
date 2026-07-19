import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useMaintenanceLabor (BL-38) — v7.97.0
 * El total_cost lo calcula la DB (GENERATED); el hook sólo debe insertar
 * horas + tarifa y confiar en el trigger `trg_maintenance_labor_recalc_cost`
 * para actualizar el costo agregado en maintenance_logs.
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

const laborInserts: unknown[] = [];
const laborDeletes: unknown[] = [];
const logCalls: Array<{ method: string; args: unknown[] }> = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "ml-1", total_cost: 500 },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      maintenance_labor: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) {
          laborInserts.push(ins.args[0]);
          return insertResp;
        }
        const del = calls.find((c) => c.method === "delete");
        if (del) {
          laborDeletes.push(del.args);
          return { data: null, error: null };
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

import { useAddMaintenanceLabor, useDeleteMaintenanceLabor } from "../useMaintenanceLabor";

beforeEach(() => {
  laborInserts.length = 0;
  laborDeletes.length = 0;
  logCalls.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "ml-1", total_cost: 500 }, error: null };
});

describe("useAddMaintenanceLabor", () => {
  it("inserta hours + hourly_rate sin escribir en maintenance_logs (lo hace el trigger)", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenanceLabor(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        maintenance_log_id: "log-1",
        mechanic_id: "mech-1",
        hours: 2.5,
        hourly_rate: 200,
        notes: "cambio de aceite",
      });
    });

    expect(laborInserts[0]).toMatchObject({
      maintenance_log_id: "log-1",
      mechanic_id: "mech-1",
      hours: 2.5,
      hourly_rate: 200,
      notes: "cambio de aceite",
    });
    // total_cost es GENERATED — el cliente NO debe mandarlo
    expect((laborInserts[0] as Record<string, unknown>).total_cost).toBeUndefined();
    expect(logCalls).toHaveLength(0);
  });

  it("propaga error del insert vía notifyError", async () => {
    insertResp = { data: null, error: { message: "fk mechanic_id" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAddMaintenanceLabor(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({
          maintenance_log_id: "log-1",
          mechanic_id: "x",
          hours: 1,
          hourly_rate: 100,
        })
        .catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al agregar mano de obra",
    });
  });
});

describe("useDeleteMaintenanceLabor", () => {
  it("elimina y deja que el trigger recalcule el costo", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteMaintenanceLabor(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync("ml-1");
    });
    expect(laborDeletes.length).toBeGreaterThan(0);
    expect(logCalls).toHaveLength(0);
  });
});
