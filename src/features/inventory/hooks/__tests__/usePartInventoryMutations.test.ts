import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * Mutaciones simples de parts_inventory (refacciones).
 * Riesgo: stock incorrecto rompe planeación de mantenimiento y costo de ROI.
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const inserts: unknown[] = [];
const updates: Array<{ patch: unknown; eqArgs: unknown[] }> = [];
const deletes: unknown[][] = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "p-1", sku: "SKU-001" }, error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "p-1" }, error: null,
};
let deleteResp: { data: unknown; error: { message: string } | null } = {
  data: null, error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      parts_inventory: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { inserts.push(ins.args[0]); return insertResp; }
        const upd = calls.find((c) => c.method === "update");
        if (upd) {
          const eq = calls.find((c) => c.method === "eq");
          updates.push({ patch: upd.args[0], eqArgs: eq?.args ?? [] });
          return updateResp;
        }
        const del = calls.find((c) => c.method === "delete");
        if (del) {
          const eq = calls.find((c) => c.method === "eq");
          deletes.push(eq?.args ?? []);
          return deleteResp;
        }
        return { data: null, error: null };
      },
    },
  }),
}));

import {
  useCreatePart, useUpdatePart, useDeletePart,
} from "../usePartInventoryMutations";

beforeEach(() => {
  inserts.length = 0; updates.length = 0; deletes.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "p-1", sku: "SKU-001" }, error: null };
  updateResp = { data: { id: "p-1" }, error: null };
  deleteResp = { data: null, error: null };
});

describe("useCreatePart", () => {
  it("inserta refacción y devuelve fila con id generado", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePart(), { wrapper: Wrapper });

    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({
        sku: "SKU-001", name: "Filtro aceite", quantity_on_hand: 10, unit_cost: 250,
      } as never);
    });

    expect(inserts[0]).toMatchObject({ sku: "SKU-001", name: "Filtro aceite" });
    expect(created).toMatchObject({ id: "p-1" });
  });

  it("propaga error con título localizado (unique SKU)", async () => {
    insertResp = { data: null, error: { message: "duplicate key parts_inventory_sku_key" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sku: "SKU-001", name: "x" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({ title: "Error al crear refacción" });
  });
});

describe("useUpdatePart", () => {
  it("patch excluye id y filtra por eq('id', ...)", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdatePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "p-1", quantity_on_hand: 25 } as never);
    });

    expect(updates[0].patch).toEqual({ quantity_on_hand: 25 });
    expect((updates[0].patch as Record<string, unknown>).id).toBeUndefined();
    expect(updates[0].eqArgs).toEqual(["id", "p-1"]);
  });
});

describe("useDeletePart", () => {
  it("elimina filtrando por id", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeletePart(), { wrapper: Wrapper });

    await act(async () => { await result.current.mutateAsync("p-1"); });

    expect(deletes[0]).toEqual(["id", "p-1"]);
  });

  it("propaga error (FK en maintenance_parts) con título localizado", async () => {
    deleteResp = { data: null, error: { message: "fk maintenance_parts_part_id_fkey" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeletePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("p-1").catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({ title: "Error al eliminar refacción" });
  });
});
