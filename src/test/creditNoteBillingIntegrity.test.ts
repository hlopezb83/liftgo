import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { computeCreditNoteLimits } from "@/features/invoices/lib/creditNoteLimits";
import { sumPaymentsInInvoiceCurrency } from "@/features/invoices/lib/paymentCurrency";
import { validateCreditNoteSourceLines } from "../../supabase/functions/_shared/creditNoteSourceValidation";

const createMutate = vi.fn();
vi.mock("@/features/invoices/hooks/creditNotes/useCreditNotes", () => ({
  useCreateCreditNote: () => ({ mutate: createMutate, isPending: false }),
}));
import { useCreditNoteForm } from "@/features/invoices/hooks/creditNotes/useCreditNoteForm";

describe("BF01/BF02: credit-note financial regressions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a partial NC with a fractional discount through the real source validator", () => {
    const invoice = {
      id: "11111111-1111-4111-8111-111111111111", customer_id: "customer-fixture",
      tax_rate: 16, moneda: "MXN", subtotal: 1991.97, tax_amount: 318.72, total: 2310.69,
      line_items: [{ description: "QA rental", quantity: 2, unit_price: 1000.99,
        total: 2001.98, discount: 0.5, discount_type: "%", objeto_imp: "02" }],
    } as unknown as Tables<"invoices">;
    const { result } = renderHook(() => useCreditNoteForm(invoice, 2310.69, vi.fn()));
    // Full-invoice control still agrees before selecting the partial quantity.
    expect(result.current.total).toBe(invoice.total);
    act(() => result.current.updateLine(0, { quantity: 1 }));
    act(() => result.current.setReason("QA local fixture"));
    expect(result.current.canSubmit).toBe(true);
    act(() => result.current.submit(false));
    const payload = createMutate.mock.calls[0][0];
    expect(payload).toMatchObject({ subtotal: 995.99, tax_amount: 159.36, total: 1155.35 });
    const validation = validateCreditNoteSourceLines(payload, invoice);
    expect(validation).toMatchObject({ ok: true, subtotal: 995.99, total: 1155.35 });
    expect(validateCreditNoteSourceLines({ ...payload, subtotal: 995.98, total: 1155.34 }, invoice)).toMatchObject({ ok: false, code: "CREDIT_NOTE_TOTALS_MISMATCH" });
    // Resetting and reselecting must retain the same correct cent values.
    act(() => result.current.reset());
    act(() => result.current.updateLine(0, { quantity: 1 }));
    expect(result.current.subtotal).toBe(995.99);
  });

  it.each([1000.97, 1000.98, 1000.99, 1001, 1001.01, 1001.02])(
    "keeps UI/Edge cent parity around the half-cent discount boundary at %s",
    (unitPrice) => {
      const invoice = {
        id: "22222222-2222-4222-8222-222222222222", customer_id: "customer-fixture",
        tax_rate: 16, moneda: "MXN",
        line_items: [{ description: "Boundary control", quantity: 2, unit_price: unitPrice,
          total: unitPrice * 2, discount: 0.5, discount_type: "%", objeto_imp: "02" }],
      } as unknown as Tables<"invoices">;
      const { result } = renderHook(() => useCreditNoteForm(invoice, 3000, vi.fn()));
      act(() => result.current.updateLine(0, { quantity: 1 }));
      act(() => result.current.setReason("QA boundary"));
      act(() => result.current.submit(false));
      expect(validateCreditNoteSourceLines(createMutate.mock.calls[0][0], invoice)).toMatchObject({ ok: true });
    },
  );

  it("control: whole-percentage discount UI agrees with source validator", () => {
    const invoice = {
      id: "22222222-2222-4222-8222-222222222222", customer_id: "customer-fixture",
      tax_rate: 16, moneda: "MXN",
      line_items: [{ description: "QA control", quantity: 1, unit_price: 1000.99,
        total: 1000.99, discount: 5, discount_type: "%", objeto_imp: "02" }],
    } as unknown as Tables<"invoices">;
    const { result } = renderHook(() => useCreditNoteForm(invoice, 2000, vi.fn()));
    act(() => result.current.setReason("QA control"));
    act(() => result.current.submit(false));
    expect(validateCreditNoteSourceLines(createMutate.mock.calls[0][0], invoice)).toMatchObject({ ok: true });
  });

  it("converts non-REP payments to the same invoice currency as REP payments", () => {
    const payments = [{ id: "payment-fixture", amount: 50, currency: "USD", exchange_rate: 20,
      rep_cfdi_status: null, rep_cancelled_at: null }] as unknown as Tables<"payments">[];
    const actual = computeCreditNoteLimits(1160, [], payments, { moneda: "MXN", tipo_cambio: 1 });
    const canonical = sumPaymentsInInvoiceCurrency(payments, "MXN", 1);
    expect(canonical).toEqual({ totalPaid: 1000, unconvertible: 0 });
    expect(actual.otherPaid).toBe(1000);
    expect(actual.otherPaid).toBe(canonical.totalPaid);
    // The same payment with a stamped REP is correctly converted by this function.
    const repControl = computeCreditNoteLimits(1160, [], [{ ...payments[0], rep_cfdi_status: "stamped" }],
      { moneda: "MXN", tipo_cambio: 1 });
    expect(repControl.repBacked).toBe(1000);
  });
});
