import { useState } from "react";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { downloadPaymentsXlsx, type PaymentExportRow } from "../lib/buildPaymentsXlsx";
import { useCreatePaymentBatch } from "./useCreatePaymentBatch";
import { useExportablePayables } from "./useExportablePayables";
import { usePaymentSelection } from "./usePaymentSelection";

/**
 * Orquestador del diálogo de exportación de pagos.
 *
 * Composición:
 * - `usePaymentSelection` → estado puro de selección múltiple (sin side effects).
 * - `useCreatePaymentBatch` → mutación que crea el batch.
 * - `downloadPaymentsXlsx` → side effect de descarga.
 */
export function useExportPaymentsForm(open: boolean, onClose: () => void) {
  const { data: bills, isLoading } = useExportablePayables();
  const createBatch = useCreatePaymentBatch();
  const selection = usePaymentSelection(open, bills);
  const [notes, setNotes] = useState("");

  // Limpia las notas cuando el diálogo se cierra desde el caller.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setNotes("");
  }


  const canExport = selection.selected.length > 0 && !selection.hasInvalid && !createBatch.isPending;

  const handleExport = async () => {
    const items = selection.selected.map((b) => ({
      bill_id: b.id,
      amount: Number((selection.rowState[b.id]?.amount ?? b.balance).toFixed(2)),
    }));
    if (items.some((i) => i.amount <= 0)) {
      notifyValidation({ message: "Todos los montos deben ser mayores a 0." });
      return;
    }
    try {
      await createBatch.mutateAsync({ items, notes: notes || undefined });
      const rows: PaymentExportRow[] = selection.selected.map((b) => {
        const amount = Number((selection.rowState[b.id]?.amount ?? b.balance).toFixed(2));
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
      notifySuccess(`Excel descargado: ${filename}`);
      setNotes("");
      onClose();
    } catch {
      /* notifyError already shown by hook */
    }
  };

  return {
    bills, isLoading,
    rowState: selection.rowState,
    notes, setNotes,
    selected: selection.selected,
    total: selection.total,
    hasInvalid: selection.hasInvalid,
    allEligibleSelected: selection.allEligibleSelected,
    toggleAll: selection.toggleAll,
    setSelected: selection.setSelected,
    setAmount: selection.setAmount,
    canExport,
    isSubmitting: createBatch.isPending,
    handleExport,
  };
}
