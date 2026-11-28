import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useGenerateRecurringInvoices } from "../useGenerateRecurringInvoices";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction: invoke }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn() }));

describe("future generation contract", () => {
  it("sends the exact selected period, fingerprint and explicit horizon", async () => {
    invoke.mockResolvedValue({ invoicesCreated: 1 });
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });
    const selections = [{ bookingId: "booking-a", periodStart: "2026-12-01", expectedFingerprint: "material-plan-hash" }];
    act(() => result.current.mutate({ selections, includeFuturePeriods: true, futureThroughMonth: "2026-12", allowStaleRate: false }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bookings"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cash_flow_projection"] });
    expect(invoke).toHaveBeenCalledWith("generate-recurring-invoices", { body: {
      preview: false, bookingIds: undefined, selections, includeFuturePeriods: true,
      futureThroughMonth: "2026-12", allowStaleRate: false,
    } });
  });
});
