import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useExportablePayables } from "./useExportablePayables";
import { useCreatePaymentBatch } from "./useCreatePaymentBatch";
import { usePaymentSelection } from "./usePaymentSelection";
import { downloadPaymentsXlsx, type PaymentExportRow } from "../lib/buildPaymentsXlsx";

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
  const [notes, setNotes] = useState("");

  // Limpia las notas cuando el diálogo se cierra desde el caller.
  useEffect(() => {
    if (!open) setNotes("");
  }, [open]);


  const canExport = selection.selected.length > 0 && !selection.hasInvalid && !createBatch.isPending;

  const handleExport = async () => {
    const items = selection.selected.map((b) => ({
      bill_id: b.id,
      amount: Number((selection.rowState[b.id]?.amount ?? b.balance).toFixed(2)),
    }));
    if (items.some((i) => i.amount <= 0)) {
      toast.error("Todos los montos deben ser mayores a 0");
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
      toast.success(`Excel descargado: ${filename}`);
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
