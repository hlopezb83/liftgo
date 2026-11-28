import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecurringInvoiceWorkflow } from "../useRecurringInvoiceWorkflow";

const { generate, preview } = vi.hoisted(() => ({ generate: vi.fn(), preview: vi.fn() }));
vi.mock("../useGenerateRecurringInvoices", () => ({ useGenerateRecurringInvoices: () => ({ mutate: generate }) }));
vi.mock("../usePreviewRecurringInvoices", () => ({ usePreviewRecurringInvoices: () => ({ mutate: preview }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe("review after partial recurring generation", () => {
  it("never replays a consumed period when the same booking also has a failed period", () => {
    const setPreviewOpen = vi.fn();
    const setResultOpen = vi.fn();
    const { result } = renderHook(() => useRecurringInvoiceWorkflow(setPreviewOpen, setResultOpen));
    const selections = [
      { bookingId: "same-booking", periodStart: "2026-11-01", expectedFingerprint: "november" },
      { bookingId: "same-booking", periodStart: "2026-12-01", expectedFingerprint: "december" },
    ];
    act(() => result.current.handleConfirm(selections, false, { includeFuturePeriods: true, futureThroughMonth: "2026-12" }));
    expect(generate).toHaveBeenCalledTimes(1);
    act(() => generate.mock.calls[0][1].onSuccess({
      invoicesCreated: 1,
      created: [{ bookingIds: ["same-booking"], invoiceId: "created-november" }],
      failed: [{ bookingIds: ["same-booking"], error: "December could not be created" }],
    }));
    expect(setResultOpen).toHaveBeenLastCalledWith(true);
    act(() => result.current.handleRetry());
    expect(generate).toHaveBeenCalledTimes(1);
    expect(setResultOpen).toHaveBeenLastCalledWith(false);
    expect(setPreviewOpen).toHaveBeenLastCalledWith(true);
    expect(preview).toHaveBeenCalledExactlyOnceWith();
  });
});
