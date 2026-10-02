import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { SuccessIcon, ErrorIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat-ui";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { formatRecurringFailure } from "../../lib/formatRecurringFailure";
import type { GenerateRecurringResponse } from "../../hooks/invoices/recurring/useGenerateRecurringInvoices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: GenerateRecurringResponse | undefined;
  onRetry: (bookingIds: string[]) => void;
  isRetrying: boolean;
}

function formatResultSummary(created: number, existing: number, failed: number): string {
  const parts = [`${created} factura${created === 1 ? "" : "s"} creada${created === 1 ? "" : "s"}`];
  if (existing > 0) parts.push(`${existing} ya existente${existing === 1 ? "" : "s"}`);
  if (failed > 0) parts.push(`${failed} fallida${failed === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}

export function RecurringInvoicesResultDialog({ open, onOpenChange, result, onRetry, isRetrying }: Props) {
  const created = result?.created ?? [];
  const alreadyExisting = result?.alreadyExisting ?? [];
  const failed = result?.failed ?? [];

  return (
    <FormDialog
      isPending={isRetrying}
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="Resultado de generación"
      description={formatResultSummary(created.length, alreadyExisting.length, failed.length)}
    >
      {/* v7.279.3: scroll nativo — ScrollArea de Radix no activa scroll con sólo max-h. */}
      <div className="max-h-[60vh] overflow-y-auto pr-3">
        <div className="space-y-4">
          {created.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <SuccessIcon className="h-4 w-4 text-success" />
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

          {alreadyExisting.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Ya existentes ({alreadyExisting.length})</h4>
              <div className="border rounded-md divide-y">
                {alreadyExisting.map((invoice) => (
                  <div key={invoice.invoiceId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      {invoice.bookingIds.length} reserva{invoice.bookingIds.length === 1 ? "" : "s"}
                    </span>
                    <Link to={`/invoices/${invoice.invoiceId}`} className="font-mono text-sm underline">
                      {invoice.invoiceNumber ?? "Ver factura"}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <ErrorIcon className="h-4 w-4 text-destructive" />
                Fallidas ({failed.length})
              </h4>
              <div className="border rounded-md divide-y">
                {failed.map((f, idx) => {
                  const message = formatRecurringFailure(f.error);
                  return (
                    <div key={idx} className="px-3 py-2 text-sm space-y-2">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{message}</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          Reserva(s): {f.bookingIds.map((id) => id.slice(0, 8)).join(", ")}
                        </span>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void navigator.clipboard?.writeText(`${message}\nReservas: ${f.bookingIds.join(", ")}`);
                              notifySuccess("Detalle copiado");
                            }}
                          >
                            Copiar detalle
                          </Button>
                          {!message.startsWith("El grupo de reservas cambió:") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRetry(f.bookingIds)}
                              disabled={isRetrying}
                            >
                              Reintentar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <FormDialogFooter>
        <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
