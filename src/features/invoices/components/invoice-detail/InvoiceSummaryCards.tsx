import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserIcon, CalendarIcon } from "@/components/icons";
import { formatDateDisplay } from "@/lib/utils";
import { formatStoredCfdiError } from "@/features/invoices/lib/formatStoredCfdiError";


type Props = {
  customerName: string | null;
  rfc: string | null;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  cfdiUuid: string | null;
  cfdiErrorMessage: string | null;
  showCfdiError: boolean;
};

export function InvoiceSummaryCards({
  customerName,
  rfc,
  issuedAt,
  dueDate,
  paidAt,
  cfdiUuid,
  cfdiErrorMessage,
  showCfdiError,
}: Props) {
  return (
    <>
      {cfdiUuid ? null : null}


      {showCfdiError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Error de timbrado</p>
            <p className="text-sm text-destructive/90 mt-1 whitespace-pre-wrap break-words">{formatStoredCfdiError(cfdiErrorMessage)}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-muted-foreground" /> Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{customerName || "—"}</p>
            {rfc && <p><span className="text-muted-foreground">RFC:</span> {rfc}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" /> Fechas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Emitida:</span> {formatDateDisplay(issuedAt)}</p>
            <p><span className="text-muted-foreground">Vencimiento:</span> {formatDateDisplay(dueDate)}</p>
            {paidAt && <p><span className="text-muted-foreground">Pagada:</span> {formatDateDisplay(paidAt)}</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
