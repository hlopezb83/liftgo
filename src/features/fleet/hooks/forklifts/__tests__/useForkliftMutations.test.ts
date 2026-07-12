import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useCreateForklift / useDeleteForklift / useUpdateStatus.
 * Riesgo crítico: status_log faltante = trazabilidad rota del ciclo de vida
 * del equipo; delete sin RPC = orfandad de FKs (bookings/mantenimientos).
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));




const forkliftInserts: unknown[] = [];
const statusLogInserts: unknown[] = [];
const forkliftUpdates: unknown[] = [];
const rpcCalls: Array<{ name: string; args: unknown }> = [];

let createResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "f-1", status: "available" },
  error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: [{ id: "f-1" }],
  error: null,
};
let rpcResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      delete_forklift: (args) => {
        rpcCalls.push({ name: "delete_forklift", args });
        return rpcResp;
      },
    },
    tableResolvers: {
      forklifts: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { forkliftInserts.push(ins.args[0]); return createResp; }
        const upd = calls.find((c) => c.method === "update");
        if (upd) { forkliftUpdates.push(upd.args[0]); return updateResp; }
        return { data: null, error: null };
      },
      status_logs: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { statusLogInserts.push(ins.args[0]); return { data: null, error: null }; }
        return { data: null, error: null };
      },
    },
  }),
}));

import {
  useCreateForklift,
  useDeleteForklift,
  useUpdateStatus,
} from "../useForkliftMutations";

beforeEach(() => {
  forkliftInserts.length = 0;
  statusLogInserts.length = 0;
  forkliftUpdates.length = 0;
  rpcCalls.length = 0;
  notifyErrorMock.mockReset();
  createResp = { data: { id: "f-1", status: "available" }, error: null };
  updateResp = { data: [{ id: "f-1" }], error: null };
  rpcResp = { data: null, error: null };
});

describe("useCreateForklift", () => {
  it("inserta forklift + status_log inicial con 'Registro inicial'", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateForklift(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        name: "MC-001",
        model: "FGC25",
        status: "available",
      } as never);
    });

    expect(forkliftInserts[0]).toMatchObject({ name: "MC-001" });
    expect(statusLogInserts[0]).toMatchObject({
      forklift_id: "f-1",
      to_status: "available",
      note: "Registro inicial",
    });
  });

  it("usa 'available' como to_status si forklift.status viene undefined", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateForklift(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "MC-002" } as never);
    });

    expect(statusLogInserts[0]).toMatchObject({ to_status: "available" });
  });

  it("propaga error de insert con título 'Error al crear montacargas' y NO crea status_log", async () => {
    createResp = { data: null, error: { message: "duplicate name" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateForklift(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "x" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(statusLogInserts).toHaveLength(0);
  });
});

describe("useDeleteForklift", () => {
  it("llama RPC delete_forklift (no DELETE directo) para respetar cascadas", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteForklift(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("f-9");
    });

    expect(rpcCalls).toEqual([{ name: "delete_forklift", args: { p_forklift_id: "f-9" } }]);
  });
});

describe("useUpdateStatus", () => {
  it("update status + insert status_log con from/to/note", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        forkliftId: "f-1",
        fromStatus: "available",
        toStatus: "rented",
        note: "Inicio renta RSV-0001",
      });
    });

    expect(forkliftUpdates[0]).toEqual({ status: "rented" });
    expect(statusLogInserts[0]).toMatchObject({
      forklift_id: "f-1",
      from_status: "available",
      to_status: "rented",
      note: "Inicio renta RSV-0001",
    });
  });

  it("falla si el update afecta cero filas (assertRowsAffected)", async () => {
    updateResp = { data: [], error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ forkliftId: "x", fromStatus: "a", toStatus: "b" })
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(statusLogInserts).toHaveLength(0);
  });
});
