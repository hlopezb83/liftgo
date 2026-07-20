import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, it, vi } from "vitest";

vi.mock("@/features/customers", () => ({ useCustomers: () => ({ data: [] }), CustomerSelector: () => null }));
vi.mock("@/features/fleet", () => ({ useEquipmentModels: () => ({ data: [{ id: "mod-1", manufacturer: "Toyota", model: "8FGCU25", default_daily_rate: 500, default_weekly_rate: 3000, default_monthly_rate: 12000 }] }) }));
vi.mock("@/features/quotes/hooks/quotes/useQuotes", () => ({
  useQuote: () => ({ data: null }),
  useNextQuoteNumber: () => ({ data: "COT-0099" }),
  useCreateQuote: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: () => {} }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn() }));

import { useQuoteFormLogic } from "@/features/quotes/hooks/useQuoteFormLogic";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe("debug", () => {
  it("dump errors", async () => {
    const { result } = renderHook(() => useQuoteFormLogic(), { wrapper });
    act(() => {
      result.current.form.setValue("customerId", "cust-1");
      result.current.form.setValue("dateRange", { from: new Date("2026-05-01"), to: new Date("2026-05-31") });
      result.current.form.setValue("rentalLines", [{ modelId: "mod-1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 12000, discount: 0, discountType: "%" }]);
    });
    const ok = await result.current.form.trigger();
    console.log("trigger ok:", ok);
    console.log("errors:", JSON.stringify(result.current.form.formState.errors, null, 2));
    console.log("values:", JSON.stringify(result.current.form.getValues(), null, 2));
  });
});
