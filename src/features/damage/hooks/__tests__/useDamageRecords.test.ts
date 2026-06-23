import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useCreateDamageRecord / useUpdateDamageRecord.
 * Riesgo: registro de daños alimenta la facturación de reparaciones; si el
 * insert falla silenciosamente, el cliente NO ve el cargo.
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));

vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const insertedPayloads: unknown[] = [];
const updatedPayloads: unknown[] = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "dmg-1" },
  error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "dmg-1" },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      damage_records: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) {
          insertedPayloads.push(ins.args[0]);
          return insertResp;
        }
        const upd = calls.find((c) => c.method === "update");
        if (upd) {
          updatedPayloads.push(upd.args[0]);
          return updateResp;
        }
        return { data: null, error: null };
      },
    },
  }),
}));

import { useCreateDamageRecord, useUpdateDamageRecord } from "../useDamageRecords";

beforeEach(() => {
  insertedPayloads.length = 0;
  updatedPayloads.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "dmg-1" }, error: null };
  updateResp = { data: { id: "dmg-1" }, error: null };
});

describe("useCreateDamageRecord", () => {
  it("inserta el registro tal cual y devuelve la fila creada", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateDamageRecord(), { wrapper: Wrapper });

    const payload = {
      forklift_id: "f-1",
      customer_id: "c-1",
      description: "Mástil torcido",
      severity: "high",
      estimated_cost: 12_500,
    } as never;

    await act(async () => {
      const r = await result.current.mutateAsync(payload);
      expect(r).toEqual({ id: "dmg-1" });
    });

    expect(insertedPayloads[0]).toMatchObject({
      forklift_id: "f-1",
      description: "Mástil torcido",
      estimated_cost: 12_500,
    });
  });

  it("propaga error con notifyError y mensaje localizado", async () => {
    insertResp = { data: null, error: { message: "constraint" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateDamageRecord(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ forklift_id: "f-1" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al crear registro de daño",
    });
  });
});

describe("useUpdateDamageRecord", () => {
  it("actualiza solo los campos provistos (excluye id del patch)", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateDamageRecord(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "dmg-1",
        status: "repaired",
        actual_cost: 14_000,
      } as never);
    });

    expect(updatedPayloads[0]).toEqual({ status: "repaired", actual_cost: 14_000 });
    expect((updatedPayloads[0] as Record<string, unknown>).id).toBeUndefined();
  });

  it("propaga error con título localizado", async () => {
    updateResp = { data: null, error: { message: "rls" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateDamageRecord(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "dmg-1", status: "x" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({
      title: "Error al actualizar registro de daño",
    });
  });
});
