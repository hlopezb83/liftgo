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

/**
 * Estado puro de selección múltiple en el diálogo de exportación de pagos.
 * Separa el manejo de `rowState` + totales del flujo de export en sí.
 */
export function usePaymentSelection(open: boolean, bills: SupplierBillRow[] | undefined) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  const [prevOpen, setPrevOpen] = useState(open);
  const [prevBills, setPrevBills] = useState(bills);
  if (open !== prevOpen || bills !== prevBills) {
    setPrevOpen(open);
    setPrevBills(bills);
    if (open) {
      const init: Record<string, RowState> = {};
      for (const b of bills ?? []) {
        init[b.id] = {
          selected: b.has_valid_clabe && !b.payment_in_progress_at,
          amount: b.balance,
        };
      }
      setRowState(init);
    }
  }

  const selected: SupplierBillRow[] = (bills ?? []).filter((b) => rowState[b.id]?.selected);
  // Total por moneda: sumar montos de MXN y USD en un solo número mezclaría
  // peras con manzanas (el Excel también se totaliza por moneda).
  const totalsByCurrency: CurrencyTotal[] = [
    ...selected
      .reduce((acc, b) => {
        const currency = b.currency || "MXN";
        acc.set(currency, (acc.get(currency) ?? 0) + (rowState[b.id]?.amount ?? 0));
        return acc;
      }, new Map<string, number>())
      .entries(),
  ]
    .map(([currency, total]) => ({ currency, total: roundMoney(total) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  const hasInvalid = selected.some((b) => !b.has_valid_clabe);
  const eligible: SupplierBillRow[] = (bills ?? []).filter(
    (b) => b.has_valid_clabe && !b.payment_in_progress_at,
  );

  const allEligibleSelected =
    eligible.length > 0 && eligible.every((b) => rowState[b.id]?.selected);

  const toggleAll = (val: boolean) => {
    setRowState((prev) => {
      const next = { ...prev };
      for (const b of eligible) {
        next[b.id] = { ...next[b.id], selected: val };
      }
      return next;
    });
  };

  const setSelected = (id: string, selected: boolean, fallback: number) => {
    setRowState((p) => ({
      ...p,
      [id]: { ...p[id], selected, amount: p[id]?.amount ?? fallback },
    }));
  };

  const setAmount = (id: string, amount: number) => {
    setRowState((p) => ({
      ...p,
      [id]: { ...p[id], amount, selected: p[id]?.selected ?? false },
    }));
  };

  return {
    rowState,
    selected,
    totalsByCurrency,
    hasInvalid,
    allEligibleSelected,
    toggleAll,
    setSelected,
    setAmount,
  };
}
