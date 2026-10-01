import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { DownloadIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useExportPaymentsForm } from "../hooks/useExportPaymentsForm";
import { PaymentsExportSummary } from "./PaymentsExportSummary";
import { PaymentsExportTable } from "./PaymentsExportTable";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportPaymentsDialog({ open, onOpenChange }: Props) {
  const form = useExportPaymentsForm(open, () => onOpenChange(false));

  return (
    <FormDialog
      isPending={form.isSubmitting}
      open={open}
      onOpenChange={onOpenChange}
      title="Exportar pagos a Excel"
      width="2xl"
      className="sm:max-w-5xl"
      description="Selecciona las facturas aprobadas a pagar. Se genera un Excel y se registra el lote para auditoría."
    >
      {form.createdBatchId ? (
        <div role="status" className="space-y-3 rounded-md border p-4">
          <p>El lote quedó guardado. Puedes reintentar su descarga o recuperarlo desde Historial de lotes.</p>
          <Button variant="outline" onClick={() => { void form.retryDownload(); }} disabled={form.isSubmitting}>
            <DownloadIcon className="mr-2 h-4 w-4" /> Reintentar descarga
          </Button>
        </div>
      ) : form.isError ? (
        <div role="alert">
          <QueryErrorState bare entity="las facturas disponibles para pago" onRetry={() => { void form.refetch(); }} isRetrying={form.isFetching} />
        </div>
      ) : <div className="overflow-auto rounded-md border">
        <PaymentsExportTable
          bills={form.bills}
          isLoading={form.isLoading}
          rowState={form.rowState}
          allEligibleSelected={form.allEligibleSelected}
          onToggleAll={form.toggleAll}
          onToggleRow={form.setSelected}
          onChangeAmount={form.setAmount}
        />
      </div>}

      {!form.isError && !form.createdBatchId && <PaymentsExportSummary
        notes={form.notes}
        onNotesChange={form.setNotes}
        selectedCount={form.selected.length}
        totalsByCurrency={form.totalsByCurrency}
        hasInvalid={form.hasInvalid}
      />}

      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={form.isSubmitting} />
        {!form.createdBatchId && <Button onClick={form.handleExport} disabled={!form.canExport}>
          {form.isSubmitting ? (
            <SpinnerIcon className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <DownloadIcon className="h-4 w-4 mr-1" />
          )}
          Descargar Excel ({form.selected.length})
        </Button>}
      </FormDialogFooter>
    </FormDialog>
  );
}
