import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      payments: () => ({ data: { id: "p-1" }, error: null }),
    },
    rpcResolvers: {
      change_forklift_status: () => ({ data: null, error: null }),
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useUpdateStatus } from "@/features/fleet/hooks/forklifts/useForkliftMutations";
import { useCreatePayment } from "@/features/invoices/hooks/usePayments";

function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey));
}

describe("FIX-R3-05 · las mutaciones invalidan reportKeys.all", () => {
  it("registrar un pago invalida los reportes", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreatePayment(), { wrapper: Wrapper });
    result.current.mutate({ invoice_id: "i-1", amount: 100, payment_date: "2026-08-10" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(spy).some((k) => k?.includes("report"))).toBe(true);
  });

  it("cambiar el estatus de una unidad invalida los reportes", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: Wrapper });
    result.current.mutate({ forkliftId: "f-1", toStatus: "maintenance", note: "servicio" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(spy).some((k) => k?.includes("report"))).toBe(true);
  });
});
