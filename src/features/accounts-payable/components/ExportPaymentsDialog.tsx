import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
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
      <div className="overflow-auto rounded-md border">
        <PaymentsExportTable
          bills={form.bills}
          isLoading={form.isLoading}
          rowState={form.rowState}
          allEligibleSelected={form.allEligibleSelected}
          onToggleAll={form.toggleAll}
          onToggleRow={form.setSelected}
          onChangeAmount={form.setAmount}
        />
      </div>

      <PaymentsExportSummary
        notes={form.notes}
        onNotesChange={form.setNotes}
        selectedCount={form.selected.length}
        total={form.total}
        hasInvalid={form.hasInvalid}
      />

      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={form.isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={form.handleExport} disabled={!form.canExport}>
          {form.isSubmitting ? (
            <SpinnerIcon className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <DownloadIcon className="h-4 w-4 mr-1" />
          )}
          Descargar Excel ({form.selected.length})
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
