import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { HistoryIcon, InvoiceIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHasModuleAccess } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { formatDateRange } from "@/lib/utils";
import { ROUTES } from "@/routes/routes";
import { extensionBillableRange } from "../../lib/extensionBilling";

interface Extension {
  id: string;
  original_end_date: string;
  new_end_date: string;
  created_at: string | null;
  reason?: string | null;
  invoice_id?: string | null;
  billed_at?: string | null;
}

interface Props {
  extensions: Extension[];
  /** Las reservas con facturación recurrente ya cobran los días extra en la mensualidad. */
  recurringBilling?: boolean | null;
}

export function BookingExtensionsCard({ extensions, recurringBilling }: Props) {
  const navigate = useNavigateTransition();
  const canInvoice = useHasModuleAccess("Facturas", "full");

  if (!extensions || extensions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-muted-foreground" /> Extensiones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recurringBilling && (
          <p className="text-xs text-muted-foreground">
            Esta reserva tiene facturación recurrente: los días extra se cobran automáticamente
            en la mensualidad correspondiente.
          </p>
        )}
        {extensions.map((ext) => {
          const range = extensionBillableRange(ext.original_end_date, ext.new_end_date);
          const invoiceId = ext.invoice_id ?? null;
          const isBilled = !!invoiceId;

          // La acción permitida por permisos permanece visible: si ya está
          // facturada se muestra deshabilitada con el motivo, junto al enlace
          // directo a la factura existente.
          const showBillAction = !recurringBilling && !!range && canInvoice;
          return (
            <div key={ext.id} className="p-3 rounded-lg bg-muted/40 text-sm space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {formatDateRange(ext.original_end_date, ext.new_end_date)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateMty(ext.created_at)}
                </span>
              </div>
              {ext.reason && <p className="text-xs">{ext.reason}</p>}
              {range && !recurringBilling && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={isBilled ? "secondary" : "outline"}>
                    {isBilled
                      ? "Facturada"
                      : `${range.days} día(s) por facturar`}
                  </Badge>
                  {invoiceId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(ROUTES.invoices.detail(invoiceId))}
                    >
                      Ver factura
                    </Button>
                  )}


                  {showBillAction && (
                    <BlockedActionButton
                      block={isBilled ? describeBusinessBlock("extension_already_billed") : null}
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
