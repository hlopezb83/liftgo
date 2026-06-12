import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useExportablePayables } from "./useExportablePayables";
import { useCreatePaymentBatch } from "./useCreatePaymentBatch";
import { downloadPaymentsXlsx, type PaymentExportRow } from "../lib/buildPaymentsXlsx";

interface RowState {
  selected: boolean;
  amount: number;
}

/** Estado y derivaciones del diálogo de exportación de pagos. */
export function useExportPaymentsForm(open: boolean, onClose: () => void) {
  const { data: bills, isLoading } = useExportablePayables();
  const createBatch = useCreatePaymentBatch();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [notes, setNotes] = useState("");

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
    setNotes("");
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
  const canExport = selected.length > 0 && !hasInvalid && !createBatch.isPending;

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

  const handleExport = async () => {
    const items = selected.map((b) => ({
      bill_id: b.id,
      amount: Number((rowState[b.id]?.amount ?? b.balance).toFixed(2)),
    }));
    if (items.some((i) => i.amount <= 0)) {
      toast.error("Todos los montos deben ser mayores a 0");
      return;
    }
    try {
      await createBatch.mutateAsync({ items, notes: notes || undefined });
      const rows: PaymentExportRow[] = selected.map((b) => {
        const amount = Number((rowState[b.id]?.amount ?? b.balance).toFixed(2));
        return {
          supplier_name: b.supplier_name,
          supplier_rfc: b.supplier_rfc,
          bank_name: b.bank_name ?? "",
          clabe: b.clabe ?? "",
          account_number: b.account_number,
          account_holder: b.account_holder,
          bill_number: b.bill_number,
          due_date: b.due_date,
          reference: `LIFTGO-${b.bill_number}`,
          concept: b.description ?? b.bill_number,
          amount,
          currency: b.currency,
        };
      });
      const filename = downloadPaymentsXlsx(rows);
      toast.success(`Excel descargado: ${filename}`);
      onClose();
    } catch {
      /* notifyError already shown by hook */
    }
  };

  return {
    bills, isLoading, rowState, notes, setNotes,
    selected, total, hasInvalid, canExport,
    allEligibleSelected, toggleAll, setSelected, setAmount,
    isSubmitting: createBatch.isPending,
    handleExport,
  };
}
