import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useCreateMaintenanceLog / useUpdateMaintenanceLog / useDeleteMaintenanceLog.
 * Riesgo: bitácora de mantenimiento incompleta = falla en auditoría y en
 * cálculo de costo total de propiedad del forklift.
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock }));

const insertedPayloads: unknown[] = [];
const updatedPayloads: unknown[] = [];
const deletedCalls: unknown[] = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "log-1" },
  error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "log-1" },
  error: null,
};
let deleteResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      maintenance_logs: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { insertedPayloads.push(ins.args[0]); return insertResp; }
        const upd = calls.find((c) => c.method === "update");
        if (upd) { updatedPayloads.push(upd.args[0]); return updateResp; }
        const del = calls.find((c) => c.method === "delete");
        if (del) { deletedCalls.push(calls); return deleteResp; }
        return { data: null, error: null };
      },
    },
  }),
}));

import {
  useCreateMaintenanceLog,
  useUpdateMaintenanceLog,
  useDeleteMaintenanceLog,
} from "../useMaintenanceLogs";

beforeEach(() => {
  insertedPayloads.length = 0;
  updatedPayloads.length = 0;
  deletedCalls.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "log-1" }, error: null };
  updateResp = { data: { id: "log-1" }, error: null };
  deleteResp = { data: null, error: null };
});

describe("useCreateMaintenanceLog", () => {
  it("inserta el log y devuelve la fila creada", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateMaintenanceLog(), { wrapper: Wrapper });

    await act(async () => {
      const r = await result.current.mutateAsync({
        forklift_id: "f-1",
        performed_at: "2026-06-13",
        cost: 3_500,
        description: "Cambio de aceite",
      } as never);
      expect(r).toEqual({ id: "log-1" });
    });

    expect(insertedPayloads[0]).toMatchObject({ forklift_id: "f-1", cost: 3_500 });
  });

  it("propaga error con título localizado en español", async () => {
    insertResp = { data: null, error: { message: "constraint" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateMaintenanceLog(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ forklift_id: "f-1" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al crear registro de mantenimiento",
    });
  });
});

describe("useUpdateMaintenanceLog", () => {
  it("update excluye id del patch (solo va al .eq)", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateMaintenanceLog(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "log-1", cost: 4_000 } as never);
    });

    expect(updatedPayloads[0]).toEqual({ cost: 4_000 });
    expect((updatedPayloads[0] as Record<string, unknown>).id).toBeUndefined();
  });
});

describe("useDeleteMaintenanceLog", () => {
  it("elimina por id", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteMaintenanceLog(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("log-9");
    });

    expect(deletedCalls).toHaveLength(1);
  });

  it("propaga error con título 'Error al eliminar registro de mantenimiento'", async () => {
    deleteResp = { data: null, error: { message: "fk" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteMaintenanceLog(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("log-9").catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al eliminar registro de mantenimiento",
    });
  });
});
