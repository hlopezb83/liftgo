import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { usePreviewRecurringInvoices } from "../usePreviewRecurringInvoices";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction: invoke }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => vi.clearAllMocks());

describe("recurring preview request ownership", () => {
  it("ignores a late old horizon and keeps only the latest result", async () => {
    const old = deferred();
    const latest = deferred();
    invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => usePreviewRecurringInvoices(), { wrapper: Wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    act(() => result.current.mutate({ includeFuturePeriods: true, futureThroughMonth: "2026-12" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    await act(async () => latest.resolve({ period: "2026-12", lines: [] }));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data?.scope).toEqual({ includeFuturePeriods: true, futureThroughMonth: "2026-12" });
    await act(async () => old.resolve({ period: "2026-11", lines: [{ bookingId: "old" }] }));
    expect(result.current.data?.lines).toEqual([]);
    expect(result.current.data?.period).toBe("2026-12");
    expect(invoke).toHaveBeenLastCalledWith("generate-recurring-invoices", {
      body: { preview: true, includeFuturePeriods: true, futureThroughMonth: "2026-12" },
    });
  });

  it("a fresh opening clears future data, and a failed latest preview cannot reuse it", async () => {
    invoke.mockResolvedValueOnce({ period: "2026-12", lines: [] });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => usePreviewRecurringInvoices(), { wrapper: Wrapper });
    act(() => result.current.mutate({ includeFuturePeriods: true, futureThroughMonth: "2026-12" }));
    await waitFor(() => expect(result.current.data).toBeDefined());
    const opening = deferred();
    invoke.mockReturnValueOnce(opening.promise);
    act(() => result.current.mutate());
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    await act(async () => opening.reject(new Error("offline")));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(false);
  });
});
