import { useState } from "react";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { downloadPaymentsXlsx, type PaymentExportRow } from "../lib/buildPaymentsXlsx";
import { useCancelPaymentBatch } from "./useCancelPaymentBatch";
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
  const cancelBatch = useCancelPaymentBatch();
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
    // M-20: validar por renglón contra el saldo (misma regla que
    // RegisterSupplierPaymentDialog), no sólo amount > 0.
    const overBalance = selection.selected.some(
      (b) => (selection.rowState[b.id]?.amount ?? b.balance) > b.balance + 0.0001,
    );
    if (items.some((i) => i.amount <= 0)) {
      notifyValidation({ message: "Todos los montos deben ser mayores a 0." });
      return;
    }
    if (overBalance) {
      notifyValidation({ message: "Hay montos que exceden el saldo pendiente de la factura. Ajusta los renglones marcados." });
      return;
    }
    let batchId: string | null = null;
    try {
      batchId = await createBatch.mutateAsync({ items, notes: notes || undefined });
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
      const filename = await downloadPaymentsXlsx(rows);
      notifySuccess(`Excel descargado: ${filename}`);
      setNotes("");
      onClose();
    } catch {
      // A2-3: si el lote ya se creó pero la generación/descarga del Excel
      // falló, el usuario se queda sin layout bancario y las facturas
      // quedarían reservadas en un lote huérfano. Lo cancelamos para
      // liberarlas; las reglas de cancelabilidad las valida el RPC.
      if (batchId) {
        try {
          await cancelBatch.mutateAsync(batchId);
          notifyValidation({
            message: "No se pudo generar el Excel. El lote de pagos se canceló y las facturas quedaron liberadas.",
          });
        } catch {
          /* notifyError del hook ya informa que el lote quedó pendiente */
        }
      }
      /* notifyError already shown by hook */
    }
  };

  return {
    bills, isLoading,
    rowState: selection.rowState,
    notes, setNotes,
    selected: selection.selected,
    totalsByCurrency: selection.totalsByCurrency,
    hasInvalid: selection.hasInvalid,
    allEligibleSelected: selection.allEligibleSelected,
    toggleAll: selection.toggleAll,
    setSelected: selection.setSelected,
    setAmount: selection.setAmount,
    canExport,
    isSubmitting: createBatch.isPending || cancelBatch.isPending,
    handleExport,
  };
}
