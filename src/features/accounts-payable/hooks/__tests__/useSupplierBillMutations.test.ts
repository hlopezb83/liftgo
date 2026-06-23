import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useCreateSupplierBill / useCancelSupplierBill.
 * Riesgo: registrar factura sin folio o cancelar sin estado correcto = inconsistencia contable.
 */

const { toastSuccess, notifyErrorMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: toastSuccess,
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const rpcCalls: Array<{ name: string; args: unknown }> = [];
const insertedPayloads: unknown[] = [];
const updatedPayloads: Array<{ patch: unknown; calls: unknown }> = [];

let nextNumberResp: { data: unknown; error: { message: string } | null } = {
  data: "SB-2026-0001",
  error: null,
};
let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "bill-1", bill_number: "SB-2026-0001" },
  error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      next_supplier_bill_number: (args) => {
        rpcCalls.push({ name: "next_supplier_bill_number", args });
        return nextNumberResp;
      },
    },
    tableResolvers: {
      supplier_bills: (calls) => {
        const insertCall = calls.find((c) => c.method === "insert");
        if (insertCall) {
          insertedPayloads.push(insertCall.args[0]);
          return insertResp;
        }
        const updateCall = calls.find((c) => c.method === "update");
        if (updateCall) {
          updatedPayloads.push({ patch: updateCall.args[0], calls });
          return updateResp;
        }
        return { data: null, error: null };
      },
    },
  }),
}));

import { useCreateSupplierBill, useCancelSupplierBill } from "../useSupplierBillMutations";

beforeEach(() => {
  rpcCalls.length = 0;
  insertedPayloads.length = 0;
  updatedPayloads.length = 0;
  toastSuccess.mockReset();
  notifyErrorMock.mockReset();
  nextNumberResp = { data: "SB-2026-0001", error: null };
  insertResp = { data: { id: "bill-1", bill_number: "SB-2026-0001" }, error: null };
  updateResp = { data: null, error: null };
});

const baseInput = {
  supplier_id: "s-1",
  issue_date: "2026-06-13",
  due_date: "2026-07-13",
  subtotal: 1_000,
  tax_amount: 160,
  total: 1_160,
  currency: "MXN" as const,
  exchange_rate: 1,
};

describe("useCreateSupplierBill", () => {
  it("genera bill_number vía RPC y lo inyecta al insert", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateSupplierBill(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(baseInput);
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("next_supplier_bill_number");
    expect(insertedPayloads[0]).toMatchObject({
      ...baseInput,
      bill_number: "SB-2026-0001",
    });
    expect(toastSuccess).toHaveBeenCalledWith("Factura registrada", { description: "SB-2026-0001" });
  });

  it("propaga error si el insert falla y NO muestra toast de éxito", async () => {
    insertResp = { data: null, error: { message: "duplicate key" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateSupplierBill(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(baseInput).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("useCancelSupplierBill", () => {
  it("actualiza status=cancelled y guarda reason en notes", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelSupplierBill(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "bill-1", reason: "Duplicada" });
    });

    expect(updatedPayloads[0].patch).toEqual({ status: "cancelled", notes: "Duplicada" });
    expect(toastSuccess).toHaveBeenCalledWith("Factura cancelada");
  });

  it("cuando reason es undefined guarda notes=null", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelSupplierBill(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "bill-2" });
    });

    expect(updatedPayloads[0].patch).toEqual({ status: "cancelled", notes: null });
  });

  it("propaga error si el update falla", async () => {
    updateResp = { data: null, error: { message: "row level security" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelSupplierBill(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "bill-3" }).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
