import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useApproveSupplierBill / useRejectSupplierBill / useRequestBillReapproval.
 * Riesgo: aprobar una factura rechazada o viceversa = pago indebido.
 */

const toastSuccess = vi.fn();
const notifyErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
}));

const rpcCalls: Array<{ name: string; args: unknown }> = [];
let approveResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let rejectResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let reapproveResp: { data: unknown; error: { message: string } | null } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      approve_supplier_bill: (args) => {
        rpcCalls.push({ name: "approve_supplier_bill", args });
        return approveResp;
      },
      reject_supplier_bill: (args) => {
        rpcCalls.push({ name: "reject_supplier_bill", args });
        return rejectResp;
      },
      request_bill_reapproval: (args) => {
        rpcCalls.push({ name: "request_bill_reapproval", args });
        return reapproveResp;
      },
    },
  }),
}));

import {
  useApproveSupplierBill,
  useRejectSupplierBill,
  useRequestBillReapproval,
} from "../useBillApprovalMutations";

describe("useBillApprovalMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    approveResp = { data: null, error: null };
    rejectResp = { data: null, error: null };
    reapproveResp = { data: null, error: null };
  });

  it("approve OK → RPC con notas + toast 'Factura aprobada'", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useApproveSupplierBill(), { wrapper: Wrapper });

    result.current.mutate({ billId: "b-1", notes: "OK con presupuesto" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcCalls).toEqual([
      { name: "approve_supplier_bill", args: { p_bill_id: "b-1", p_notes: "OK con presupuesto" } },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith("Factura aprobada");
  });

  it("approve sin notas → RPC envía p_notes: null (no undefined)", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useApproveSupplierBill(), { wrapper: Wrapper });
    result.current.mutate({ billId: "b-1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcCalls[0].args).toEqual({ p_bill_id: "b-1", p_notes: null });
  });

  it("reject OK → RPC + toast 'Factura rechazada'", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRejectSupplierBill(), { wrapper: Wrapper });

    result.current.mutate({ billId: "b-2", notes: "Falta evidencia" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcCalls).toEqual([
      { name: "reject_supplier_bill", args: { p_bill_id: "b-2", p_notes: "Falta evidencia" } },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith("Factura rechazada");
  });

  it("approve falla → notifyError, no toast success", async () => {
    approveResp = { data: null, error: { message: "Sin permisos" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useApproveSupplierBill(), { wrapper: Wrapper });

    result.current.mutate({ billId: "b-1" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "No se pudo aprobar la factura" }),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("reapprove OK → RPC + toast 'Reaprobación solicitada'", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRequestBillReapproval(), { wrapper: Wrapper });
    result.current.mutate({ billId: "b-3", notes: "Cambio de monto" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcCalls[0]).toEqual({
      name: "request_bill_reapproval",
      args: { p_bill_id: "b-3", p_notes: "Cambio de monto" },
    });
    expect(toastSuccess).toHaveBeenCalledWith("Reaprobación solicitada");
  });
});
