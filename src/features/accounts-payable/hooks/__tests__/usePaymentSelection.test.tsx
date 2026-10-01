import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePaymentSelection, type SupplierBillRow } from "../usePaymentSelection";

function bill(id: string, balance = 116): SupplierBillRow {
  return {
    id, balance, bill_number: id, supplier_id: "supplier", supplier_name: "Refacciones",
    supplier_rfc: null, due_date: "2026-10-28", currency: "MXN", exchange_rate: null,
    description: null, payment_in_progress_at: null, bank_name: "Banco",
    clabe: "012345678901234568", account_number: null, account_holder: "Refacciones",
    has_valid_clabe: true,
  };
}

describe("payment selection during concurrent changes", () => {
  it("accepts new equivalent arrays and reordered rows without render loops or lost choices", () => {
    const { result, rerender } = renderHook(({ rows }) => usePaymentSelection(true, rows), {
      initialProps: { rows: [bill("one"), bill("two")] },
    });
    act(() => result.current.setAmount("one", 50));
    rerender({ rows: [bill("one"), bill("two")] });
    rerender({ rows: [bill("two"), bill("one")] });
    expect(result.current.rowState.one).toEqual({ selected: true, amount: 50 });
  });
  it("preserves a partial amount and deselections after another payment refetches the bills", () => {
    const { result, rerender } = renderHook(({ rows, open }) => usePaymentSelection(open, rows), {
      initialProps: { rows: [bill("one"), bill("two")], open: true },
    });
    act(() => {
      result.current.setAmount("one", 50);
      result.current.setSelected("two", false, 116);
    });
    rerender({ rows: [bill("one", 106), bill("two")], open: true });
    expect(result.current.rowState.one).toEqual({ selected: true, amount: 50 });
    expect(result.current.rowState.two.selected).toBe(false);
    expect(result.current.totalsByCurrency).toEqual([{ currency: "MXN", total: 50 }]);
  });

  it("keeps the amount visible and invalid when the new balance is lower", () => {
    const { result, rerender } = renderHook(({ rows }) => usePaymentSelection(true, rows), {
      initialProps: { rows: [bill("one")] },
    });
    act(() => result.current.setAmount("one", 50));
    rerender({ rows: [bill("one", 40)] });
    expect(result.current.rowState.one.amount).toBe(50);
    expect(result.current.hasInvalid).toBe(true);
  });

  it("does not automatically select a newly arriving document and drops vanished rows", () => {
    const { result, rerender } = renderHook(({ rows }) => usePaymentSelection(true, rows), {
      initialProps: { rows: [bill("one")] },
    });
    rerender({ rows: [bill("one"), bill("new")] });
    expect(result.current.rowState.new.selected).toBe(false);
    rerender({ rows: [bill("new")] });
    expect(result.current.rowState.one).toBeUndefined();
    expect(result.current.selected).toEqual([]);
  });

  it("deselects a document reserved by another session without replacing its partial amount", () => {
    const { result, rerender } = renderHook(({ rows }) => usePaymentSelection(true, rows), {
      initialProps: { rows: [bill("one")] },
    });
    act(() => result.current.setAmount("one", 50));
    rerender({ rows: [{ ...bill("one"), payment_in_progress_at: "2026-10-01T12:00:00Z" }] });
    expect(result.current.rowState.one).toEqual({ selected: false, amount: 50 });
    expect(result.current.selected).toEqual([]);
  });

  it("initializes after loading and starts fresh when a new dialog session opens", () => {
    const { result, rerender } = renderHook(
      ({ rows, open }: { rows: SupplierBillRow[] | undefined; open: boolean }) => usePaymentSelection(open, rows),
      { initialProps: { rows: undefined as SupplierBillRow[] | undefined, open: true } },
    );
    rerender({ rows: [bill("one")], open: true });
    expect(result.current.rowState.one).toEqual({ selected: true, amount: 116 });
    act(() => result.current.setAmount("one", 50));
    rerender({ rows: [bill("one", 106)], open: false });
    rerender({ rows: [bill("one", 106)], open: true });
    expect(result.current.rowState.one).toEqual({ selected: true, amount: 106 });
  });
});
