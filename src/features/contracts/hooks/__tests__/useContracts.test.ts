import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useCreateContract / useUpdateContract.
 * Riesgo: contract_number duplicado o nulo = pérdida de trazabilidad legal
 * y rechazo del contrato impreso ante el cliente.
 */

const insertedPayloads: unknown[] = [];
const updatedPayloads: unknown[] = [];
const updateFilters: Array<{ method: string; args: unknown[] }> = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "ctr-1", contract_number: "CTR-2026-0001" },
  error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "ctr-1" },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      contracts: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { insertedPayloads.push(ins.args[0]); return insertResp; }
        const upd = calls.find((c) => c.method === "update");
        if (upd) {
          updatedPayloads.push(upd.args[0]);
          updateFilters.push(...calls.filter((call) => call.method === "eq"));
          return updateResp;
        }
        return { data: null, error: null };
      },
    },
  }),
}));

import { useCreateContract, useUpdateContract } from "../useContracts";

beforeEach(() => {
  insertedPayloads.length = 0;
  updatedPayloads.length = 0;
  updateFilters.length = 0;
  insertResp = { data: { id: "ctr-1", contract_number: "CTR-2026-0001" }, error: null };
  updateResp = { data: { id: "ctr-1" }, error: null };
});

describe("useCreateContract", () => {
  it("delega la numeración al trigger del mismo INSERT", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateContract(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        customer_id: "c-1",
        forklift_id: "f-1",
        start_date: "2026-06-13",
        end_date: "2027-06-12",
        monthly_rate: 15_000,
      } as never);
    });

    expect(insertedPayloads[0]).toMatchObject({
      customer_id: "c-1",
      forklift_id: "f-1",
      monthly_rate: 15_000,
      contract_number: "",
    });
  });

  it("propaga error si el insert falla", async () => {
    insertResp = { data: null, error: { message: "duplicate contract_number" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateContract(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ customer_id: "c-1" } as never)
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("Hallazgo 7 · traduce el 23505 del índice único a 'Ya existe un contrato para esta reserva'", async () => {
    insertResp = {
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "contracts_one_active_per_booking"',
        code: "23505",
      } as never,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateContract(), { wrapper: Wrapper });

    let caught: unknown;
    await act(async () => {
      await result.current
        .mutateAsync({ customer_id: "c-1", booking_id: "b-1" } as never)
        .catch((e) => { caught = e; });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((caught as Error).message).toBe("Ya existe un contrato para esta reserva");
  });
});

describe("useUpdateContract", () => {
  it("update excluye id del patch", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateContract(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "ctr-1", status: "active" } as never);
    });

    expect(updatedPayloads[0]).toEqual({ status: "active" });
    expect((updatedPayloads[0] as Record<string, unknown>).id).toBeUndefined();
  });

  it("rejects a stale edit without overwriting another user's changes", async () => {
    updateResp = { data: null, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdateContract(), { wrapper: Wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: "ctr-1", expectedUpdatedAt: "2026-09-29T10:00:00Z", notes: "Nuevo" });
      } catch (error) { caught = error; }
    });

    expect(updateFilters).toContainEqual({ method: "eq", args: ["updated_at", "2026-09-29T10:00:00Z"] });
    expect((caught as Error).message).toContain("El contrato cambió");
  });
});
