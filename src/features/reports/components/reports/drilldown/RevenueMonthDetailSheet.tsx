import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { exportToCsv } from "@/lib/exportCsv";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { invoiceNetMxn, invoiceTotalMxn, type DrilldownInvoice } from "../../../lib/drilldown";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  monthLabel: string | null;
  invoiced: number;
  paid: number;
  invoices: DrilldownInvoice[];
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xs uppercase text-muted-foreground">{label}</p>
      <p className="tabular-nums font-bold">{value}</p>
    </div>
  );
}

export function RevenueMonthDetailSheet({
  open, onOpenChange, monthLabel, invoiced, paid, invoices,
  isLoading, isError, isRetrying, onRetry,
}: Props) {
  const navigate = useNavigateTransition();

  const go = (id: string) => {
    onOpenChange(false);
    navigate(`/invoices/${id}`);
  };

  const handleExport = () => {
    exportToCsv(`ingresos-${monthLabel ?? "mes"}.csv`, invoices.map((i) => ({
      Factura: i.invoice_number,
      Cliente: i.customer_name || "",
      Emisión: i.issued_at,
      Moneda: i.moneda || "MXN",
      "Tipo Cambio": i.moneda && i.moneda !== "MXN" ? (i.tipo_cambio ?? "") : 1,
      "Total bruto": i.total,
      "Total bruto MXN": invoiceTotalMxn(i) ?? "",
      "Notas de crédito MXN": Number(i.credited_mxn ?? 0),
      "Facturado neto MXN": invoiceNetMxn(i) ?? "",
      Estado: i.status,
    })));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {monthLabel} <span className="text-muted-foreground font-normal text-sm">— facturas del mes</span>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Facturado" value={formatCurrency(invoiced)} />
            <Stat label="Pagado" value={formatCurrency(paid)} />
            <Stat label="Facturas" value={isLoading || isError ? "—" : String(invoices.length)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Detalle {isLoading || isError ? "" : `(${invoices.length})`}</h3>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isLoading || isError || invoices.length === 0}>
              <DownloadIcon className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>
          {isError ? (
            <QueryErrorState entity="el detalle de ingresos" onRetry={onRetry} isRetrying={isRetrying} />
          ) : isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Cargando facturas del mes…</p>
          ) : invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sin facturas en el mes</p>
          ) : (
            <ul className="space-y-1">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => go(inv.id)}
                    className="w-full h-auto flex items-center justify-between gap-3 text-left rounded-md border p-2 text-xs font-normal"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{inv.invoice_number}</p>
                      <p className="text-muted-foreground truncate">
                        {inv.customer_name || "—"} · {formatDateMty(inv.issued_at)}
                        {inv.moneda && inv.moneda !== "MXN" ? ` · ${inv.moneda}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={inv.status} />
                      <div className="text-right">
                        <span className="font-mono font-bold" title={invoiceNetMxn(inv) === null ? "Factura en divisa sin tipo de cambio" : undefined}>
                          {invoiceNetMxn(inv) === null ? "Sin T.C." : formatCurrency(invoiceNetMxn(inv) ?? 0)}
                        </span>
                        {Number(inv.credited_mxn ?? 0) > 0 && (
                          <p className="text-3xs text-muted-foreground">
                            Bruto {formatCurrency(invoiceTotalMxn(inv))} − NC {formatCurrency(Number(inv.credited_mxn))}
                          </p>
                        )}
                      </div>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
