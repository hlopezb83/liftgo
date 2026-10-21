import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), notify: vi.fn() }));
vi.mock("@/features/customers", () => ({ useCustomers: () => ({ data: [] }) }));
vi.mock("@/features/fleet", () => ({ useEquipmentModels: () => ({ data: [], isSuccess: true }) }));
vi.mock("@/hooks/useInitialRecordVersion", () => ({ useInitialRecordVersion: () => 1 }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: vi.fn() }));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: "historical" }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyValidation: state.notify, notifyError: state.notify, notifySuccess: vi.fn() }));
const values = {
  quoteType: "sale" as const, customerId: "qa", customerName: "QA", currency: "MXN" as const, tipoCambio: 1,
  taxRate: "11", notes: "Old", validUntil: undefined, dateRange: undefined, rentalLines: [],
  saleLines: [{ modelId: "model", quantity: 1, unitPrice: 100, discount: 0, discountType: "%" as const }],
  includeLogistics: false, logisticsCost: 0, includeInsurance: false, insuranceCost: 0,
};
const historicalLines = [{ description: "Historic sale", quantity: 1, unit_price: 100, total: 100, archived_marker: "keep" }];
vi.mock("../useQuotePrefill", () => ({ useQuotePrefillValues: () => values }));
vi.mock("../quoteFormBuilders", () => ({ buildSaleItems: () => [{description:"Historic sale",quantity:1,unit_price:100,total:100}], buildRentalItems: () => [] }));
vi.mock("../../quotes/useQuotes", () => ({
  useQuote: () => ({ data: { id: "historical", quote_number: "OLD", status: "draft", tax_rate: 11,
    line_items: historicalLines, subtotal: 100, tax_amount: 11, total: 111 }, isSuccess: true }),
  useCreateQuote: () => ({ mutate: state.create, isPending: false }),
  useUpdateQuote: () => ({ mutate: state.update, isPending: false }),
}));
import { useQuoteFormLogic } from "../useQuoteFormLogic";
beforeEach(() => { state.update.mockClear(); state.create.mockClear(); state.notify.mockClear(); });
it("notes-only historical quote edit sends stored JSON/totals, not regenerated lines", async () => {
  const { result } = renderHook(() => useQuoteFormLogic());
  await act(async () => { result.current.form.setValue("notes", "Reviewed"); });
  await act(async () => { await result.current.handleSubmit(); });
  expect(state.notify).not.toHaveBeenCalled();
  expect(state.update).toHaveBeenCalledOnce();
  expect(state.update.mock.calls[0][0]).toMatchObject({ id:"historical", notes:"Reviewed", line_items: historicalLines, tax_rate:11, subtotal:100, tax_amount:11, total:111 });
  expect(state.create).not.toHaveBeenCalled();
});
it("changing a historical fiscal input with 11 does not save", async () => {
  const { result } = renderHook(() => useQuoteFormLogic());
  await act(async () => { result.current.form.setValue("saleLines.0.quantity", 2); });
  await act(async () => { await result.current.handleSubmit(); });
  expect(state.update).not.toHaveBeenCalled();
  expect(state.notify.mock.calls[0][0].message).toContain("11%");
});
