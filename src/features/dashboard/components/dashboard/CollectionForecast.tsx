import { parseISO, addDays } from "date-fns";
import { Link } from "react-router";
import { TrendingUpIcon, ArrowRight, CalendarIcon } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { toMxn } from "@/lib/money";
import { nowMty } from "@/lib/utils";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  total: number;
  /** Saldo pendiente en moneda de la factura. */
  balance?: number | null;
  /** Saldo pendiente ya convertido a MXN (preferido). */
  balance_mxn?: number | null;
  moneda?: string | null;
  tipo_cambio?: number | null;
  due_date: string | null;
}

interface UpcomingInvoiceLike extends OverdueInvoice {
  due_date: string | null;
}

interface CollectionForecastProps {
  /** Facturas vencidas (ya en mora) */
  overdueInvoices: OverdueInvoice[];
  /** Facturas con vencimiento próximo (no pagadas, due_date futuro) — opcional */
  upcomingInvoices?: UpcomingInvoiceLike[];
}

/**
 * Devuelve el saldo en MXN. Prioriza `balance_mxn` (calculado en la vista
 * `v_invoices_with_balance`). Si no está, convierte `balance` con
 * `tipo_cambio` y cae al `total` como último recurso. BL-1.1 R5: evita sumar
 * USD como si fueran MXN.
 */
export function amountInMxn(
  inv: Pick<OverdueInvoice, "balance" | "balance_mxn" | "moneda" | "tipo_cambio" | "total">,
): number {
  if (inv.balance_mxn != null) return Number(inv.balance_mxn);
  const base = inv.balance != null ? Number(inv.balance) : Number(inv.total);
  return toMxn(base, inv.moneda ?? null, inv.tipo_cambio ?? null);
}

/**
 * Widget de pronóstico de cobranza.
 * Calcula el monto esperado a cobrar en los próximos 7 y 30 días,
 * incluyendo facturas vencidas (cobranza inmediata) + próximas a vencer.
 */
export function CollectionForecast({
  overdueInvoices,
  upcomingInvoices = [],
}: CollectionForecastProps) {
  const forecast = (() => {
    const today = nowMty();
    const in7 = addDays(today, 7);
    const in30 = addDays(today, 30);

    const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + amountInMxn(inv), 0);

    const within7 = upcomingInvoices
      .filter((inv) => {
        if (!inv.due_date) return false;
        const due = parseISO(inv.due_date);
        return due >= today && due <= in7;
      })
      .reduce((sum, inv) => sum + amountInMxn(inv), 0);

    const within30 = upcomingInvoices
      .filter((inv) => {
        if (!inv.due_date) return false;
        const due = parseISO(inv.due_date);
        return due >= today && due <= in30;
      })
      .reduce((sum, inv) => sum + amountInMxn(inv), 0);

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
  })();

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
            <p className="text-3xs text-muted-foreground mt-0.5">
              {forecast.overdueCount} factura{forecast.overdueCount === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" /> Próximos 7 días
            </p>
            <p className="text-lg font-bold font-mono">{formatCurrency(forecast.expected7)}</p>
            <p className="text-3xs text-muted-foreground mt-0.5">
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
            <p className="text-3xs text-muted-foreground mt-0.5">Cobranza esperada total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
