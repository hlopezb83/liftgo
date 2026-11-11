import { lazy, memo, Suspense, useCallback, useEffect, useEffectEvent, useState } from "react";
import { useRecurringInvoiceWorkflow } from "../../hooks/invoices/recurring/useRecurringInvoiceWorkflow";
import { RecurringInvoicesPreviewDialog } from "./RecurringInvoicesPreviewDialog";

const RecurringInvoicesResultDialog = lazy(() => import("./RecurringInvoicesResultDialog")
  .then((module) => ({ default: module.RecurringInvoicesResultDialog })));

const RecurringInvoiceDialogs = memo(function RecurringInvoiceDialogs({ opening }: { opening: number }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const { generateRecurring, previewRecurring, openPreview, handleConfirm, handleRetry } =
    useRecurringInvoiceWorkflow(setPreviewOpen, setResultOpen);
  const openFromToolbar = useEffectEvent(openPreview);
  useEffect(() => { if (opening > 0) openFromToolbar(); }, [opening]);

  const cancelPreview = previewRecurring.cancel;
  const onPreviewOpenChange = useCallback((open: boolean) => {
    if (!open) cancelPreview();
    setPreviewOpen(open);
  }, [cancelPreview]);

  return <>
    <RecurringInvoicesPreviewDialog
      open={previewOpen}
      onOpenChange={onPreviewOpenChange}
      data={previewRecurring.data}
      isLoading={previewRecurring.isPending}
      isError={previewRecurring.isError}
      onScopeChange={previewRecurring.mutate}
      isGenerating={generateRecurring.isPending}
      onConfirm={handleConfirm}
    />
    {resultOpen && <Suspense fallback={<p role="status" className="sr-only">Cargando resultado de facturación…</p>}>
      <RecurringInvoicesResultDialog
        open
        onOpenChange={setResultOpen}
        result={generateRecurring.data}
        onRetry={handleRetry}
        retryRequiresReview
        isRetrying={generateRecurring.isPending}
      />
    </Suspense>}
  </>;
});

export default RecurringInvoiceDialogs;
