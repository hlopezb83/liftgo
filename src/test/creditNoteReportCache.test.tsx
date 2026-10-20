import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const state = vi.hoisted(() => ({ revenue: 1000, credits: 0, rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/lib/rpc", () => ({ callRpc: state.rpc }));
vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction: state.invoke }));
vi.mock("@/features/feedback", () => ({ satStatusLabel: () => "" }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn(), notifyWarning: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { credit_notes: () => ({ data: { id: "qa-local-note" }, error: null }) },
    rpcResolvers: { next_draft_credit_note_number: () => ({ data: "QA-001", error: null }) },
  }),
}));

import { createAppQueryClient } from "@/lib/query/appQueryClient";
import { useMonthlyData } from "@/features/reports/hooks/incomeStatement/useMonthlyData";
import {
  useCancelCreditNote, useCreateCreditNote, useStampCreditNote,
} from "@/features/invoices/hooks/creditNotes/useCreditNoteMutations";
import { useRefreshCreditNoteCancellationStatus } from "@/features/invoices/hooks/invoices/cfdi/useRefreshCancellationStatus";

const props = {
  startDate: new Date("2026-10-01T12:00:00Z"), endDate: new Date("2026-10-31T12:00:00Z"),
  accountingBasis: "accrual" as const,
};

function harness() {
  const queryClient = createAppQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, Wrapper };
}

beforeEach(() => {
  state.revenue = 1000;
  state.credits = 0;
  state.rpc.mockReset();
  state.invoke.mockReset();
  state.rpc.mockImplementation(async () => ({ months: [{
    month_key: "2026-10", month_label: "Oct", revenue: state.revenue, credit_notes_total: state.credits,
    revenue_rental_booked: state.revenue, revenue_rental_unbooked: 0, revenue_sales: 0,
    revenue_other_services: 0, revenue_damage_recovery: 0, maintenance_cost: 0, damage_cost: 0,
    depreciation: 0, depreciation_rented: 0, depreciation_idle: 0, cogs_forklift_sales: 0, expenses: {},
  }], rented_without_cost: [], sold_without_cost: [] }));
});

describe("BF06: credit-note mutations invalidate the real income-statement cache", () => {
  it.each(["stamp", "create-and-stamp", "cancel", "refresh-cancel"] as const)(
    "%s refreshes an inactive report on immediate remount, without manual refresh",
    async (operation) => {
      const cancelling = operation === "cancel" || operation === "refresh-cancel";
      state.revenue = cancelling ? 800 : 1000;
      state.credits = cancelling ? 200 : 0;
      const expectedRevenue = cancelling ? 1000 : 800;
      const expectedCredits = cancelling ? 0 : 200;
      state.invoke.mockImplementation(async () => {
        state.revenue = expectedRevenue;
        state.credits = expectedCredits;
        return { success: true, cancellation_status: "accepted" };
      });
      const { queryClient, Wrapper } = harness();
      const before = renderHook(() => useMonthlyData(props), { wrapper: Wrapper });
      await waitFor(() => expect(before.result.current.data[0]?.revenue).toBe(cancelling ? 800 : 1000));
      before.unmount();
      const mutation = renderHook(() => ({
        stamp: useStampCreditNote(), create: useCreateCreditNote(),
        cancel: useCancelCreditNote(), refresh: useRefreshCreditNoteCancellationStatus(),
      }), { wrapper: Wrapper });
      await act(async () => {
        if (operation === "stamp") await mutation.result.current.stamp.mutateAsync("qa-local-note");
        else if (operation === "cancel") {
          await mutation.result.current.cancel.mutateAsync({ creditNoteId: "qa-local-note", motive: "02" });
        } else if (operation === "refresh-cancel") {
          await mutation.result.current.refresh.mutateAsync("qa-local-note");
        } else {
          await mutation.result.current.create.mutateAsync({
            invoice_id: "qa-invoice", customer_id: "qa-customer", motive: "return", reason_text: "QA",
            line_items: [], subtotal: 200, tax_rate: 0, tax_amount: 0, total: 200, currency: "MXN", stamp: true,
          });
        }
      });
      expect(state.invoke).toHaveBeenCalledTimes(1);
      const cached = queryClient.getQueryCache().findAll({ queryKey: ["income_statement"] })[0];
      expect(cached.state.isInvalidated).toBe(true);
      const after = renderHook(() => useMonthlyData(props), { wrapper: Wrapper });
      await waitFor(() => expect(after.result.current.data[0]?.revenue).toBe(expectedRevenue));
      expect(after.result.current.data[0]?.creditNotes).toBe(expectedCredits);
      expect(state.rpc).toHaveBeenCalledTimes(2);
      after.unmount(); mutation.unmount(); queryClient.clear();
    },
  );

  it("refreshes a currently mounted report after stamping", async () => {
    state.invoke.mockImplementation(async () => {
      state.revenue = 800; state.credits = 200;
      return { success: true };
    });
    const { queryClient, Wrapper } = harness();
    const report = renderHook(() => useMonthlyData(props), { wrapper: Wrapper });
    await waitFor(() => expect(report.result.current.data[0]?.revenue).toBe(1000));
    const mutation = renderHook(() => useStampCreditNote(), { wrapper: Wrapper });
    await act(async () => { await mutation.result.current.mutateAsync("qa-local-note"); });
    await waitFor(() => expect(report.result.current.data[0]?.revenue).toBe(800));
    expect(report.result.current.data[0]?.creditNotes).toBe(200);
    report.unmount(); mutation.unmount(); queryClient.clear();
  });

  it("control: a failed stamp does not manufacture a financial change or success", async () => {
    state.invoke.mockRejectedValue(new Error("QA rejected before stamping"));
    const { queryClient, Wrapper } = harness();
    const report = renderHook(() => useMonthlyData(props), { wrapper: Wrapper });
    await waitFor(() => expect(report.result.current.data[0]?.revenue).toBe(1000));
    const mutation = renderHook(() => useStampCreditNote(), { wrapper: Wrapper });
    await act(async () => {
      await expect(mutation.result.current.mutateAsync("qa-local-note")).rejects.toThrow("QA rejected");
    });
    await waitFor(() => expect(mutation.result.current.isError).toBe(true));
    expect(report.result.current.data[0]?.revenue).toBe(1000);
    expect(report.result.current.data[0]?.creditNotes).toBe(0);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    report.unmount(); mutation.unmount(); queryClient.clear();
  });
});
