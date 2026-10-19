import { act, renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { paymentKeys } from "../../../../lib/queryKeys";
import { useStampPaymentComplement } from "../usePaymentComplement";

const m = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction: m.invoke }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyInfo: vi.fn(), notifyError: vi.fn() }));

const id = "synthetic-payment";
const cached = [{ id, rep_cfdi_status: "none" }];
const queryKey = paymentKeys.byFilter({ invoiceId: "synthetic-invoice" });

function setup(queryFn: () => Promise<typeof cached>) {
  const { Wrapper, queryClient } = createQueryWrapper();
  const hook = renderHook(() => ({
    payments: useQuery({ queryKey, queryFn, initialData: cached, staleTime: Infinity }),
    stamp: useStampPaymentComplement(),
  }), { wrapper: Wrapper });
  return { ...hook, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.invoke.mockRejectedValue(Object.assign(new Error("No se confirmó el resultado"), { code: "PAC_UNCERTAIN" }));
});

describe("REP recovery keeps cached actions safe", () => {
  it("holds isPending until the authoritative payment refetch completes", async () => {
    let resolve!: (data: typeof cached) => void;
    const queryFn = vi.fn(() => new Promise<typeof cached>((done) => { resolve = done; }));
    const { result } = setup(queryFn);
    act(() => result.current.stamp.mutate(id));
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
    expect(result.current.stamp.isPending).toBe(true);
    await act(async () => resolve([{ id, rep_cfdi_status: "stamping" }]));
    await waitFor(() => expect(result.current.stamp.isError).toBe(true));
    expect(result.current.payments.data).toEqual([{ id, rep_cfdi_status: "stamping" }]);
    expect(m.invoke).toHaveBeenCalledTimes(1);
  });

  it("blocks stale none locally if the refetch fails, without fabricating persisted state", async () => {
    const { result, queryClient } = setup(async () => { throw new Error("Synthetic offline refetch"); });
    act(() => result.current.stamp.mutate(id));
    await waitFor(() => expect(result.current.stamp.isError).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual(cached);
    await act(async () => { await result.current.stamp.mutateAsync(id).catch(() => {}); });
    expect(m.invoke).toHaveBeenCalledTimes(1);
  });

  it("does not treat a missing payment query as a successful refresh", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampPaymentComplement(), { wrapper: Wrapper });
    act(() => result.current.mutate(id));
    await waitFor(() => expect(result.current.isError).toBe(true));
    await act(async () => { await result.current.mutateAsync(id).catch(() => {}); });
    expect(m.invoke).toHaveBeenCalledTimes(1);
  });

  it("permits correction after a fresh pre-PAC pending result, preserving the original failure", async () => {
    const failure = Object.assign(new Error("Falta configuración fiscal"), { status: 400 });
    m.invoke.mockRejectedValue(failure);
    const { result } = setup(async () => [{ id, rep_cfdi_status: "pending" }]);
    act(() => result.current.stamp.mutate(id));
    await waitFor(() => expect(result.current.stamp.isError).toBe(true));
    expect(result.current.stamp.error).toBe(failure);
    expect(result.current.payments.data).toEqual([{ id, rep_cfdi_status: "pending" }]);
    act(() => result.current.stamp.mutate(id));
    await waitFor(() => expect(m.invoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.stamp.isError).toBe(true));
  });
});
