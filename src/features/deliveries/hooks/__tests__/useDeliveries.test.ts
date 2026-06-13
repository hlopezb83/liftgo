import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useDeliveries — mutaciones de entregas (ENT-/DEV-).
 * Riesgo: errores silenciosos en logística rompen trazabilidad de equipos.
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock }));

const inserts: unknown[] = [];
const updates: Array<{ patch: unknown; eqArgs: unknown[] }> = [];
const deletes: unknown[][] = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "d-1", delivery_number: "ENT-0001" }, error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "d-1" }, error: null,
};
let deleteResp: { data: unknown; error: { message: string } | null } = {
  data: null, error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      deliveries: (calls) => {
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

import { useCreateDelivery, useUpdateDelivery, useDeleteDelivery } from "../useDeliveries";

beforeEach(() => {
  inserts.length = 0; updates.length = 0; deletes.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "d-1", delivery_number: "ENT-0001" }, error: null };
  updateResp = { data: { id: "d-1" }, error: null };
  deleteResp = { data: null, error: null };
});

describe("useCreateDelivery", () => {
  it("inserta entrega y devuelve fila con delivery_number generado por DB", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateDelivery(), { wrapper: Wrapper });

    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({
        booking_id: "b-1", forklift_id: "f-1", type: "delivery",
        scheduled_date: "2026-06-13",
      } as never);
    });

    expect(inserts[0]).toMatchObject({ booking_id: "b-1", forklift_id: "f-1", type: "delivery" });
    expect(created).toMatchObject({ id: "d-1", delivery_number: "ENT-0001" });
  });

  it("propaga error de insert con título localizado", async () => {
    insertResp = { data: null, error: { message: "fk forklift_id" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateDelivery(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ booking_id: "b-1", forklift_id: "x", type: "delivery", scheduled_date: "2026-06-13" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({ title: "Error al crear entrega" });
  });
});

describe("useUpdateDelivery", () => {
  it("patch excluye id del update y filtra por eq('id', ...)", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateDelivery(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "d-1", notes: "Llegó tarde" } as never);
    });

    expect(updates[0].patch).toEqual({ notes: "Llegó tarde" });
    expect((updates[0].patch as Record<string, unknown>).id).toBeUndefined();
    expect(updates[0].eqArgs).toEqual(["id", "d-1"]);
  });

  it("propaga error con título localizado", async () => {
    updateResp = { data: null, error: { message: "rls" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateDelivery(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "d-1", notes: "x" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({ title: "Error al actualizar entrega" });
  });
});

describe("useDeleteDelivery", () => {
  it("elimina filtrando por id", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeleteDelivery(), { wrapper: Wrapper });

    await act(async () => { await result.current.mutateAsync("d-1"); });

    expect(deletes[0]).toEqual(["id", "d-1"]);
  });
});
