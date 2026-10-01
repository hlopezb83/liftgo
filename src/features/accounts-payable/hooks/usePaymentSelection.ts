import { useState } from "react";
import { roundMoney } from "@/lib/money";
import type { ExportablePayable } from "./useExportablePayables";

interface RowState {
  selected: boolean;
  amount: number;
}
export interface CurrencyTotal {
  currency: string;
  total: number;
}
export type SupplierBillRow = ExportablePayable;
const AMOUNT_TOLERANCE = 0.0001;

function reconcileRows(
  bills: SupplierBillRow[],
  previous: Record<string, RowState>,
  firstLoad: boolean,
): Record<string, RowState> {
  return Object.fromEntries(bills.map((bill) => {
    const existing = previous[bill.id];
    const eligible = bill.has_valid_clabe && !bill.payment_in_progress_at;
    return [bill.id, {
      selected: eligible && (existing?.selected ?? firstLoad),
      amount: existing?.amount ?? bill.balance,
    }];
  }));
}

/** Preserve user choices on refetch; validate them against the latest balances. */
export function usePaymentSelection(open: boolean, bills: SupplierBillRow[] | undefined) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [prevOpen, setPrevOpen] = useState(open);
  const billSignature = bills?.map((bill) => JSON.stringify([bill.id, bill.has_valid_clabe, !!bill.payment_in_progress_at])).join("|");
  const [prevSignature, setPrevSignature] = useState(billSignature);
  const [initialized, setInitialized] = useState(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    setPrevSignature(billSignature);
    setInitialized(open && bills !== undefined);
    setRowState(open && bills ? reconcileRows(bills, {}, true) : {});
  } else if (open && bills !== undefined && (!initialized || billSignature !== prevSignature)) {
    setPrevSignature(billSignature);
    setInitialized(true);
    setRowState(reconcileRows(bills, rowState, !initialized));
  }

  const selected = (bills ?? []).filter((bill) => rowState[bill.id]?.selected);
  const totalsByCurrency: CurrencyTotal[] = [...selected.reduce((totals, bill) => {
    const currency = bill.currency || "MXN";
    totals.set(currency, (totals.get(currency) ?? 0) + (rowState[bill.id]?.amount ?? 0));
    return totals;
  }, new Map<string, number>())].map(([currency, total]) => ({
    currency, total: roundMoney(total),
  })).sort((a, b) => a.currency.localeCompare(b.currency));

  const hasInvalid = selected.some((bill) => {
    const amount = rowState[bill.id]?.amount ?? bill.balance;
    return !bill.has_valid_clabe || !Number.isFinite(amount) ||
      amount <= 0 || amount > bill.balance + AMOUNT_TOLERANCE;
  });
  const eligible = (bills ?? []).filter((bill) => bill.has_valid_clabe && !bill.payment_in_progress_at);
  const allEligibleSelected = eligible.length > 0 && eligible.every((bill) => rowState[bill.id]?.selected);

  const toggleAll = (selected: boolean) => setRowState((previous) => {
    const next = { ...previous };
    for (const bill of eligible) next[bill.id] = { ...next[bill.id], selected };
    return next;
  });
  const setSelected = (id: string, selected: boolean, fallback: number) => setRowState((previous) => ({
    ...previous,
    [id]: { ...previous[id], selected, amount: previous[id]?.amount ?? fallback },
  }));
  const setAmount = (id: string, amount: number) => setRowState((previous) => ({
    ...previous,
    [id]: { ...previous[id], amount, selected: previous[id]?.selected ?? false },
  }));

  return {
    rowState, selected, totalsByCurrency, hasInvalid, allEligibleSelected,
    toggleAll, setSelected, setAmount,
  };
}
