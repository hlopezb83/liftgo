import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useExportPaymentsForm } from "../hooks/useExportPaymentsForm";
import { PaymentsExportTable } from "./PaymentsExportTable";
import { PaymentsExportSummary } from "./PaymentsExportSummary";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportPaymentsDialog({ open, onOpenChange }: Props) {
  const form = useExportPaymentsForm(open, () => onOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Exportar pagos a Excel
          </DialogTitle>
          <DialogDescription>
            Selecciona las facturas aprobadas a pagar. Se genera un Excel y se registra el lote para auditoría.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto rounded-md border">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={form.isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={form.handleExport} disabled={!form.canExport}>
            {form.isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            Descargar Excel ({form.selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
