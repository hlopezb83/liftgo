import { useRef, useState } from "react";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useCreatePaymentBatch } from "./useCreatePaymentBatch";
import { useDownloadPaymentBatch } from "./useDownloadPaymentBatch";
import { useExportablePayables } from "./useExportablePayables";
import { usePaymentSelection } from "./usePaymentSelection";

export function useExportPaymentsForm(open: boolean, onClose: () => void) {
  const { data: bills, isPending: isLoading, isFetching, isError, refetch } = useExportablePayables(open);
  const createBatch = useCreatePaymentBatch();
  const downloadBatch = useDownloadPaymentBatch();
  const selection = usePaymentSelection(open, bills);
  const [notes, setNotes] = useState("");
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const inFlight = useRef(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setNotes("");
      setCreatedBatchId(null);
    }
  }

  const canExport = selection.selected.length > 0 && !selection.hasInvalid &&
    !isLoading && !isFetching && !isError && !isExporting && !createdBatchId;

  const handleExport = async () => {
    if (inFlight.current || !canExport) return;
    const items = selection.selected.map((bill) => ({
      bill_id: bill.id,
      amount: Number((selection.rowState[bill.id]?.amount ?? bill.balance).toFixed(2)),
    }));
    if (items.some((item) => !Number.isFinite(item.amount) || item.amount <= 0)) {
      notifyValidation({ message: "Todos los montos deben ser mayores a 0." });
      return;
    }
    inFlight.current = true;
    setIsExporting(true);
    try {
      const batchId = await createBatch.mutateAsync({ items, notes: notes || undefined });
      setCreatedBatchId(batchId);
      await downloadBatch.mutateAsync(batchId);
      onClose();
    } catch {
      // Keep the persisted batch recoverable after download/network failures.
      // Retrying downloads it again; it never creates or cancels another batch.
    } finally {
      inFlight.current = false;
      setIsExporting(false);
    }
  };

  const retryDownload = async () => {
    if (!createdBatchId || inFlight.current) return;
    inFlight.current = true;
    setIsExporting(true);
    try {
      await downloadBatch.mutateAsync(createdBatchId);
      onClose();
    } catch {
      /* The hook reports the error; the batch remains in history. */
    } finally {
      inFlight.current = false;
      setIsExporting(false);
    }
  };

  return {
    bills, isLoading, isFetching, isError, refetch,
    rowState: selection.rowState, notes, setNotes,
    selected: selection.selected, totalsByCurrency: selection.totalsByCurrency,
    hasInvalid: selection.hasInvalid, allEligibleSelected: selection.allEligibleSelected,
    toggleAll: selection.toggleAll, setSelected: selection.setSelected, setAmount: selection.setAmount,
    canExport, createdBatchId, retryDownload, isSubmitting: isExporting, handleExport,
  };
}
