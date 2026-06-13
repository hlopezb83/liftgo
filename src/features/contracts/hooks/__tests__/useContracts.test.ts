import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useCreateContract / useUpdateContract.
 * Riesgo: contract_number duplicado o nulo = pérdida de trazabilidad legal
 * y rechazo del contrato impreso ante el cliente.
 */

const rpcCalls: Array<{ name: string; args: unknown }> = [];
const insertedPayloads: unknown[] = [];
const updatedPayloads: unknown[] = [];

let nextNumberResp: { data: unknown; error: { message: string } | null } = {
  data: "CTR-2026-0001",
  error: null,
};
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
    rpcResolvers: {
      next_contract_number: (args) => {
        rpcCalls.push({ name: "next_contract_number", args });
        return nextNumberResp;
      },
    },
    tableResolvers: {
      contracts: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { insertedPayloads.push(ins.args[0]); return insertResp; }
        const upd = calls.find((c) => c.method === "update");
        if (upd) { updatedPayloads.push(upd.args[0]); return updateResp; }
        return { data: null, error: null };
      },
    },
  }),
}));

import { useCreateContract, useUpdateContract } from "../useContracts";

beforeEach(() => {
  rpcCalls.length = 0;
  insertedPayloads.length = 0;
  updatedPayloads.length = 0;
  nextNumberResp = { data: "CTR-2026-0001", error: null };
  insertResp = { data: { id: "ctr-1", contract_number: "CTR-2026-0001" }, error: null };
  updateResp = { data: { id: "ctr-1" }, error: null };
});

describe("useCreateContract", () => {
  it("genera contract_number vía RPC y lo inyecta al insert", async () => {
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

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("next_contract_number");
    expect(insertedPayloads[0]).toMatchObject({
      customer_id: "c-1",
      forklift_id: "f-1",
      monthly_rate: 15_000,
      contract_number: "CTR-2026-0001",
    });
  });

  it("propaga error si el RPC de numeración falla y NO inserta", async () => {
    nextNumberResp = { data: null, error: { message: "sequence locked" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateContract(), { wrapper: Wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ customer_id: "c-1" } as never)
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(insertedPayloads).toHaveLength(0);
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
});
