import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * Mutaciones de prospectos CRM (kanban).
 * Riesgo crítico: stage_order mal calculado → tarjetas duplicadas o
 * reorden caótico al crear nuevos prospectos.
 */

const { toastSuccess, notifyErrorMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock }));

const insertedPayloads: unknown[] = [];
const updatedPayloads: unknown[] = [];
const deletedCalls: unknown[] = [];

let selectResp: { data: unknown; error: { message: string } | null } = {
  data: [{ stage_order: 4 }],
  error: null,
};
let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "p-1", stage_order: 5 },
  error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "p-1" },
  error: null,
};
let deleteResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      prospects: (calls) => {
        const insertCall = calls.find((c) => c.method === "insert");
        if (insertCall) {
          insertedPayloads.push(insertCall.args[0]);
          return insertResp;
        }
        const updateCall = calls.find((c) => c.method === "update");
        if (updateCall) {
          updatedPayloads.push(updateCall.args[0]);
          return updateResp;
        }
        const deleteCall = calls.find((c) => c.method === "delete");
        if (deleteCall) {
          deletedCalls.push(calls);
          return deleteResp;
        }
        return selectResp;
      },
    },
  }),
}));

import {
  useCreateProspect,
  useUpdateProspect,
  useDeleteProspect,
} from "../useProspectMutations";

beforeEach(() => {
  insertedPayloads.length = 0;
  updatedPayloads.length = 0;
  deletedCalls.length = 0;
  toastSuccess.mockReset();
  notifyErrorMock.mockReset();
  selectResp = { data: [{ stage_order: 4 }], error: null };
  insertResp = { data: { id: "p-1", stage_order: 5 }, error: null };
  updateResp = { data: { id: "p-1" }, error: null };
  deleteResp = { data: null, error: null };
});

describe("useCreateProspect", () => {
  it("calcula stage_order = max existente + 1", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateProspect(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        name: "Nuevo lead",
        stage: "qualified",
      } as never);
    });

    expect(insertedPayloads[0]).toMatchObject({
      name: "Nuevo lead",
      stage: "qualified",
      stage_order: 5,
    });
    expect(toastSuccess).toHaveBeenCalledWith("Prospecto creado");
  });

  it("cuando la columna está vacía usa stage_order = 0", async () => {
    selectResp = { data: [], error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateProspect(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        name: "Primer lead",
        stage: "lead",
      } as never);
    });

    expect(insertedPayloads[0]).toMatchObject({ stage_order: 0 });
  });

  it("propaga error de insert sin mostrar toast de éxito", async () => {
    insertResp = { data: null, error: { message: "duplicate" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateProspect(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ name: "x", stage: "lead" } as never)
        .catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("useUpdateProspect", () => {
  it("actualiza campos del prospecto", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateProspect(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "p-1", stage: "won" } as never);
    });

    expect(updatedPayloads[0]).toEqual({ stage: "won" });
  });

  it("propaga error de update", async () => {
    updateResp = { data: null, error: { message: "rls" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateProspect(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "p-1" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
  });
});

describe("useDeleteProspect", () => {
  it("elimina prospecto y muestra toast", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteProspect(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("p-9");
    });

    expect(deletedCalls).toHaveLength(1);
    expect(toastSuccess).toHaveBeenCalledWith("Prospecto eliminado");
  });

  it("propaga error de delete sin toast de éxito", async () => {
    deleteResp = { data: null, error: { message: "fk violation" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteProspect(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("p-9").catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
