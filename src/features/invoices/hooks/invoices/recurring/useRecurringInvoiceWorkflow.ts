import { notifySuccess } from "@/lib/ui/appFeedback";
import { useGenerateRecurringInvoices } from "./useGenerateRecurringInvoices";
import { usePreviewRecurringInvoices, type RecurringPreviewScope } from "./usePreviewRecurringInvoices";

export function useRecurringInvoiceWorkflow(setPreviewOpen: (o: boolean) => void, setResultOpen: (o: boolean) => void) {
  const generateRecurring = useGenerateRecurringInvoices({ onShowDetails: () => setResultOpen(true) });
  const previewRecurring = usePreviewRecurringInvoices();

  const openPreview = () => {
    setPreviewOpen(true);
    previewRecurring.mutate();
  };

  const handleConfirm = (
    selections: Array<{ bookingId: string; periodStart: string; expectedFingerprint?: string }>,
    allowStaleRate = false,
    scope: RecurringPreviewScope = { includeFuturePeriods: false },
  ) => {
    const request = { selections, allowStaleRate, ...scope };
    generateRecurring.mutate(request, {
      onSuccess: (data) => {
        setPreviewOpen(false);
        setResultOpen(true);
        const count = data?.invoicesCreated ?? 0;
        const failedCount = data?.failed?.length ?? 0;
        if (count > 0) {
          notifySuccess(`${count} factura${count === 1 ? "" : "s"} generada${count === 1 ? "" : "s"}`, {
            description: failedCount > 0 ? `${failedCount} fallida${failedCount === 1 ? "" : "s"}.` : "Borradores creados.",
          });
        }
      },
    });
  };

  const handleRetry = () => {
    // A failed booking may also own a successfully generated period. Never
    // replay a partially consumed selection or its now-stale fingerprints.
    setResultOpen(false);
    openPreview();
  };

  return { generateRecurring, previewRecurring, openPreview, handleConfirm, handleRetry };
}
