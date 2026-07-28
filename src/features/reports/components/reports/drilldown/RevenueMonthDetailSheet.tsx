import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { invoiceTotalMxn, type DrilldownInvoice } from "../../../lib/drilldown";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  monthLabel: string | null;
  invoiced: number;
  paid: number;
  invoices: DrilldownInvoice[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xs uppercase text-muted-foreground">{label}</p>
      <p className="font-mono font-bold">{value}</p>
    </div>
  );
}

export function RevenueMonthDetailSheet({
  open, onOpenChange, monthLabel, invoiced, paid, invoices,
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
      "Tipo Cambio": i.tipo_cambio ?? 1,
      Total: i.total,
      "Total MXN": invoiceTotalMxn(i),
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
            <Stat label="Facturas" value={String(invoices.length)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Detalle ({invoices.length})</h3>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={invoices.length === 0}>
              <DownloadIcon className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>
          {invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sin facturas en el mes</p>
          ) : (
            <ul className="space-y-1">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => go(inv.id)}
                    className="w-full flex items-center justify-between gap-3 text-left rounded-md border p-2 text-xs hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{inv.invoice_number}</p>
                      <p className="text-muted-foreground truncate">
                        {inv.customer_name || "—"} · {formatDateDisplay(inv.issued_at)}
                        {inv.moneda && inv.moneda !== "MXN" ? ` · ${inv.moneda}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={inv.status} />
                      <span className="font-mono font-bold">{formatCurrency(invoiceTotalMxn(inv))}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
