import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUpIcon, ArrowRight, CalendarIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { parseISO, addDays } from "date-fns";
import { nowMty } from "@/lib/utils";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  total: number;
  /** Saldo pendiente (total - pagos). Si no está, se usa total como fallback. */
  balance?: number | null;
  due_date: string | null;
}

interface CollectionForecastProps {
  /** Facturas vencidas (ya en mora) */
  overdueInvoices: OverdueInvoice[];
  /** Facturas con vencimiento próximo (no pagadas, due_date futuro) — opcional */
  upcomingInvoices?: OverdueInvoice[];
}

/**
 * Widget de pronóstico de cobranza.
 * Calcula el monto esperado a cobrar en los próximos 7 y 30 días,
 * incluyendo facturas vencidas (cobranza inmediata) + próximas a vencer.
 */
export const CollectionForecast = memo(function CollectionForecast({
  overdueInvoices,
  upcomingInvoices = [],
}: CollectionForecastProps) {
  const forecast = useMemo(() => {
    const today = nowMty();
    const in7 = addDays(today, 7);
    const in30 = addDays(today, 30);

    const amountOf = (inv: OverdueInvoice) =>
      inv.balance != null ? Number(inv.balance) : Number(inv.total);

    const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + amountOf(inv), 0);

    const within7 = upcomingInvoices
      .filter((inv) => {
        if (!inv.due_date) return false;
        const due = parseISO(inv.due_date);
        return due >= today && due <= in7;
      })
      .reduce((sum, inv) => sum + amountOf(inv), 0);

    const within30 = upcomingInvoices
      .filter((inv) => {
        if (!inv.due_date) return false;
        const due = parseISO(inv.due_date);
        return due >= today && due <= in30;
      })
      .reduce((sum, inv) => sum + amountOf(inv), 0);

    const expected7 = overdueTotal + within7;
    const expected30 = overdueTotal + within30;

    return {
      overdueTotal,
      expected7,
      expected30,
      overdueCount: overdueInvoices.length,
      upcoming7Count: upcomingInvoices.filter((inv) => {
        if (!inv.due_date) return false;
        const due = parseISO(inv.due_date);
        return due >= today && due <= in7;
      }).length,
    };
  }, [overdueInvoices, upcomingInvoices]);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-success/10">
              <TrendingUpIcon className="h-4 w-4 text-success" />
            </div>
            <h3 className="text-sm font-semibold">Pronóstico de Cobranza</h3>
          </div>
          <Link
            to="/invoices?status=overdue"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            Ver facturas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Vencido hoy</p>
            <p className="text-lg font-bold font-mono text-destructive">
              {formatCurrency(forecast.overdueTotal)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {forecast.overdueCount} factura{forecast.overdueCount === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" /> Próximos 7 días
            </p>
            <p className="text-lg font-bold font-mono">{formatCurrency(forecast.expected7)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Vencidas + {forecast.upcoming7Count} por vencer
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" /> Próximos 30 días
            </p>
            <p className="text-lg font-bold font-mono text-success">
              {formatCurrency(forecast.expected30)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Cobranza esperada total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
