import { useEffect, useState } from "react";
import type { ExportablePayable } from "./useExportablePayables";

interface RowState {
  selected: boolean;
  amount: number;
}

export type SupplierBillRow = ExportablePayable;

/**
 * Estado puro de selección múltiple en el diálogo de exportación de pagos.
 * Separa el manejo de `rowState` + totales del flujo de export en sí.
 */
export function usePaymentSelection(open: boolean, bills: SupplierBillRow[] | undefined) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<string, RowState> = {};
    for (const b of bills ?? []) {
      init[b.id] = {
        selected: b.has_valid_clabe && !b.payment_in_progress_at,
        amount: b.balance,
      };
    }
    setRowState(init);
  }, [open, bills]);

  const selected = useMemo(
    () => (bills ?? []).filter((b) => rowState[b.id]?.selected),
    [bills, rowState],
  );

  const total = useMemo(
    () => selected.reduce((acc, b) => acc + (rowState[b.id]?.amount ?? 0), 0),
    [selected, rowState],
  );

  const hasInvalid = selected.some((b) => !b.has_valid_clabe);

  const eligible = useMemo(
    () => (bills ?? []).filter((b) => b.has_valid_clabe && !b.payment_in_progress_at),
    [bills],
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
    total,
    hasInvalid,
    allEligibleSelected,
    toggleAll,
    setSelected,
    setAmount,
  };
}
