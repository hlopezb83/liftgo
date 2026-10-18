import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: mocks.notifySuccess,
  notifyError: mocks.notifyError,
  notifyValidation: vi.fn(),
}));

// Exercise the real callRpc wrapper and useEntityMutation implementation.
import { useUpdateSupplierBill } from "../useSupplierBillMutations";
import { supplierBillKeys } from "../useSupplierBills";

const billId = "11111111-1111-4111-8111-111111111111";
const patch = {
  supplier_id: "22222222-2222-4222-8222-222222222222",
  category: "renta" as const,
  description: "Synthetic local fixture",
  issue_date: "2026-10-18",
  due_date: null,
  coverage_start: null,
  coverage_end: null,
  currency: "MXN",
  exchange_rate: 1,
  subtotal: 100,
  discount: 10,
  tax_amount: 0,
  retention_iva: 0,
  retention_isr: 0,
  total: 90,
  cfdi_uuid: null,
  payment_method_sat: "PPD",
  cfdi_xml_url: null,
};

const clients: QueryClient[] = [];
function mountMutation() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  clients.push(client);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { ...renderHook(() => useUpdateSupplierBill(), { wrapper: Wrapper }), client, invalidate };
}

describe("useUpdateSupplierBill: proposed guarded RPC bridge (K1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: billId, error: null });
    // The legacy path can complete normally so the red run proves the missing
    // RPC contract, rather than failing because an unrelated mock is absent.
    mocks.eq.mockResolvedValue({ data: null, error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ update: mocks.update });
  });

  afterEach(() => {
    cleanup();
    for (const client of clients.splice(0)) client.clear();
  });

  it("sends the complete discount patch through the RPC and never calls table UPDATE", async () => {
    const { result } = mountMutation();
    let savedId: string | undefined;
    await act(async () => {
      savedId = await result.current.mutateAsync({ id: billId, patch });
    });

    expect(savedId).toBe(billId);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("update_supplier_bill_details", {
      p_bill_id: billId,
      p_patch: patch,
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("propagates the original server rejection without invalidation, success feedback, or raw fallback", async () => {
    const serverError = Object.assign(new Error("Synthetic monetary lock"), { code: "23514" });
    mocks.rpc.mockResolvedValue({ data: null, error: serverError });
    const { result, invalidate } = mountMutation();

    await act(async () => {
      await expect(result.current.mutateAsync({ id: billId, patch })).rejects.toBe(serverError);
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
    expect(mocks.notifyError).toHaveBeenCalledWith(expect.objectContaining({
      title: "No se pudo actualizar la factura",
      error: serverError,
    }));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves the existing supplier-bill invalidation scope and success feedback", async () => {
    const { result, client, invalidate } = mountMutation();
    const listKey = supplierBillKeys.lists();
    const detailKey = supplierBillKeys.detail(billId);
    const unrelatedKey = ["synthetic-unrelated-cache"] as const;
    client.setQueryData(listKey, [{ id: billId, total: 100 }]);
    client.setQueryData(detailKey, { id: billId, total: 100 });
    client.setQueryData(unrelatedKey, { unchanged: true });

    await act(async () => {
      await result.current.mutateAsync({ id: billId, patch });
    });

    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: supplierBillKeys.all });
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
    expect(mocks.notifySuccess).toHaveBeenCalledExactlyOnceWith("Factura actualizada");
  });
});
