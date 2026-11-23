import { ROUTES } from "@/app-routes/routes";
import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { HistoryIcon, InvoiceIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHasFinancialAccess, useHasModuleAccess } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { useLocation } from "@/lib/router-compat";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { extensionBillableRange } from "../../lib/extensionBilling";

interface Extension {
  id: string;
  original_end_date: string;
  new_end_date: string;
  created_at: string | null;
  reason?: string | null;
  invoice_id?: string | null;
  billed_at?: string | null;
  pending_invoice_id?: string | null;
}

interface Props {
  extensions: Extension[];
  billingChecking?: boolean;
  billingError?: boolean;
  onRetryBilling?: () => void;
  /** Los días adicionales se incluyen al generar el borrador mensual de la reserva. */
  recurringBilling?: boolean | null;
}

function billingBadgeLabel(isBilled: boolean, isPendingIssue: boolean, days: number): string {
  if (isBilled) return "Facturada";
  if (isPendingIssue) return "Pendiente de emisión";
  return `${days} ${days === 1 ? "día" : "días"} por facturar`;
}

export function BookingExtensionsCard({ extensions, recurringBilling, billingChecking = false, billingError = false, onRetryBilling }: Props) {
  const navigate = useNavigateTransition();
  const location = useLocation();
  const canSeeFinancials = useHasFinancialAccess();
  const canInvoice = useHasModuleAccess("Facturas", "full");
  const showBilling = canSeeFinancials && !recurringBilling;
  const billingUnavailable = billingChecking || billingError;

  if (!extensions.length && !billingChecking && !billingError) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-muted-foreground" /> Extensiones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {billingError && onRetryBilling ? (
          <QueryErrorState bare entity="las extensiones de la reserva" isRetrying={billingChecking} onRetry={onRetryBilling} />
        ) : billingChecking ? (
          <p role="status" className="text-sm text-muted-foreground">Cargando extensiones…</p>
        ) : null}
        {extensions.length > 0 && canSeeFinancials && recurringBilling && (
          <p className="text-xs text-muted-foreground">
            Los días adicionales de esta reserva se incluyen al generar el borrador
            del periodo mensual correspondiente.
          </p>
        )}
        {extensions.map((ext) => {
          const range = extensionBillableRange(ext.original_end_date, ext.new_end_date);
          const invoiceId = ext.invoice_id ?? null;
          const isBilled = !!invoiceId;
          // Bloque 1 · G: reservada a una factura en borrador — pendiente de
          // emisión, todavía no cuenta como facturada.
          const pendingInvoiceId = ext.pending_invoice_id ?? null;
          const isPendingIssue = !isBilled && !!pendingInvoiceId;

          // La acción permitida por permisos permanece visible: si ya está
          // facturada se muestra deshabilitada con el motivo, junto al enlace
          // directo a la factura existente.
          const showBillAction = !recurringBilling && !!range && canInvoice;
          return (
            <div key={ext.id} className="p-3 rounded-lg bg-muted/40 text-sm space-y-1.5">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Fin anterior</dt>
                  <dd>{formatDateMty(ext.original_end_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Nuevo fin</dt>
                  <dd>{formatDateMty(ext.new_end_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Registrada</dt>
                  <dd>{formatDateMty(ext.created_at)}</dd>
                </div>
              </dl>
              {ext.reason && <p className="text-xs">{ext.reason}</p>}
              {showBilling && range && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={isBilled ? "secondary" : "outline"}>
                    {billingBadgeLabel(isBilled, isPendingIssue, range.days)}
                  </Badge>
                  {(invoiceId || pendingInvoiceId) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        navigate(ROUTES.invoices.detail((invoiceId ?? pendingInvoiceId) as string), { state: { bookingInvoiceBackTo: `${location.pathname}${location.search}`, bookingReturnState: location.state } })
                      }
                    >
                      Ver factura
                    </Button>
                  )}


                  {showBillAction && (
                    <BlockedActionButton
                      disabled={billingUnavailable}
                      block={
                        isBilled || isPendingIssue
                          ? describeBusinessBlock("extension_already_billed")
                          : null
                      }
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`${ROUTES.invoices.new}?extension_id=${ext.id}`)}
                    >
                      <InvoiceIcon className="mr-2 h-4 w-4" /> Facturar extensión
                    </BlockedActionButton>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
