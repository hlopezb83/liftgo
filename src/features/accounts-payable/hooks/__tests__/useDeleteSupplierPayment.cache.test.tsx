import { useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { cashFlowProjectionQueries } from "@/features/cash-flow";
import { exportablePayableQueries } from "../useExportablePayables";
import { useDeleteSupplierPayment } from "../useDeleteSupplierPayment";

let persistedBalance = 106;
vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseChainMock } = await import("@/test/helpers/supabaseChain");
  return { supabase: createSupabaseChainMock({ tableResolvers: {
    supplier_payments: (calls) => {
      if (calls.some((call) => call.method === "delete")) persistedBalance = 116;
      return { data: null, error: null };
    },
  } }) };
});
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(), notifySuccess: vi.fn(),
}));

beforeEach(() => { persistedBalance = 106; });

describe("supplier payment deletion with fresh cached projections", () => {
  it("refreshes both existing export and cash-flow observers before their stale windows expire", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => ({
      remove: useDeleteSupplierPayment(),
      exportBalance: useQuery({
        queryKey: exportablePayableQueries.list().queryKey,
        queryFn: async () => persistedBalance, staleTime: 30_000,
      }),
      flowBalance: useQuery({
        queryKey: cashFlowProjectionQueries.list({ weeks: 8, initialBalance: 0, safetyBuffer: 0 }).queryKey,
        queryFn: async () => 2_000 + persistedBalance, staleTime: 60_000,
      }),
    }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.flowBalance.data).toBe(2_106));
    expect(result.current.exportBalance.data).toBe(106);
    await act(async () => {
      await result.current.remove.mutateAsync({ paymentId: "dedicated-payment", billId: "bill-1" });
    });
    await waitFor(() => expect(result.current.exportBalance.data).toBe(116));
    expect(result.current.flowBalance.data).toBe(2_116);
  });
});
