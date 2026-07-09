import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { GenerateRecurringResponse } from "../../hooks/invoices/recurring/useGenerateRecurringInvoices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: GenerateRecurringResponse | undefined;
  onRetry: (bookingIds: string[]) => void;
  isRetrying: boolean;
}

export function RecurringInvoicesResultDialog({ open, onOpenChange, result, onRetry, isRetrying }: Props) {
  const created = result?.created ?? [];
  const failed = result?.failed ?? [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="Resultado de generación"
      description={
        <>
          {created.length} factura{created.length === 1 ? "" : "s"} creada
          {created.length === 1 ? "" : "s"}
          {failed.length > 0 && `, ${failed.length} fallida${failed.length === 1 ? "" : "s"}`}.
        </>
      }
    >
      <ScrollArea className="max-h-[60vh] pr-3">
        <div className="space-y-4">
          {created.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Creadas ({created.length})
              </h4>
              <div className="border rounded-md divide-y">
                {created.map((c) => (
                  <div key={c.invoiceId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      {c.bookingIds.length} reserva{c.bookingIds.length === 1 ? "" : "s"}
                    </span>
                    <Link to={`/invoices/${c.invoiceId}`} className="font-mono text-sm underline">
                      {c.invoiceNumber ?? "Ver factura"}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                Fallidas ({failed.length})
              </h4>
              <div className="border rounded-md divide-y">
                {failed.map((f, idx) => (
                  <div key={idx} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">{f.error}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRetry(f.bookingIds)}
                        disabled={isRetrying}
                      >
                        Reintentar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <FormDialogFooter>
        <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
