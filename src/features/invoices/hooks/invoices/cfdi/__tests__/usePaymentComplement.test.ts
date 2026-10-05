import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useCancelPaymentComplement, useStampPaymentComplement } from "../usePaymentComplement";

const m = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction: m.invoke }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: m.success, notifyInfo: m.info, notifyError: m.error,
}));

beforeEach(() => vi.clearAllMocks());

describe("complemento de pago — resultado fiscal", () => {
  it("sólo anuncia cancelación cuando el SAT la aceptó", async () => {
    m.invoke.mockResolvedValue({ cancellation_status: "accepted", accepted: true });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelPaymentComplement(), { wrapper: Wrapper });
    result.current.mutate({ paymentId: "payment-1", motive: "02" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(m.success).toHaveBeenCalledExactlyOnceWith("Complemento de pago cancelado");
    expect(m.info).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", /sigue vigente/],
    ["verifying", /validando/],
    ["rejected", /rechazada/],
    ["expired", /venció/],
    [undefined, /No se confirmó/],
    ["unexpected", /No se confirmó/],
  ])("no anuncia cancelación final para %s", async (status, expected) => {
    m.invoke.mockResolvedValue({ cancellation_status: status, accepted: false, warning: "Aviso anterior" });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelPaymentComplement(), { wrapper: Wrapper });
    result.current.mutate({ paymentId: "payment-1", motive: "02" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(m.success).not.toHaveBeenCalled();
    expect(m.info).toHaveBeenCalledWith(expect.stringMatching(expected));
  });

  it("un REP pendiente informa sin prometer UUID ni anunciar timbrado", async () => {
    m.invoke.mockRejectedValue(Object.assign(new Error("Timbrado pendiente"), { code: "PAC_PENDING" }));
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampPaymentComplement(), { wrapper: Wrapper });
    result.current.mutate("payment-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(m.info).toHaveBeenCalledWith(expect.stringContaining("consulta su estado"));
    expect(m.success).not.toHaveBeenCalled();
    expect(m.error).not.toHaveBeenCalled();
  });
});
