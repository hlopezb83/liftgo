import { MoneyIcon, DocumentIcon, TrendingUpIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rentalDaysInclusive, useBooking } from "@/features/bookings";
import { calculateRentalCost } from "@/lib/domain/invoiceHelpers";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { sumMoney } from "@/lib/money";
import { parseDateLocal } from "@/lib/utils";
import { useContractFinancialSummary } from "../../hooks/contractDetail/useContractFinancialSummary";
import { useContractRevenueVerification } from "../../hooks/contractDetail/useContractRevenueVerification";
import type { ContractRevenueVerification } from "../../lib/contractRevenueVerification";

interface RentalFinancialSummaryProps {
  bookingId: string;
  startDate: string;
  endDate: string;
  dailyRate: number | null;
  weeklyRate: number | null;
  monthlyRate: number | null;
}

function ExpectedRevenue({ revenue, value, currency }: {
  revenue: ContractRevenueVerification; value: number; currency: string;
}) {
  if (revenue.status === "verified") {
    return <p className="text-lg font-bold">{formatCurrencyWithCode(value, currency)}</p>;
  }
  return <>
    <p className="text-sm font-semibold">{revenue.status === "loading" ? "Verificando importe pactado" : "Revisar importe pactado"}</p>
    <p className="text-xs text-muted-foreground">{revenue.reason}</p>
  </>;
}

function RemainingBalance({ canCompare, isForeignRate, rateCurrency, remaining, notice }: {
  canCompare: boolean; isForeignRate: boolean; rateCurrency: string; remaining: number; notice: string;
}) {
  if (!canCompare) {
    return <><p className="text-lg font-bold text-muted-foreground">—</p><p className="text-xs text-muted-foreground">{notice}</p></>;
  }
  if (isForeignRate) {
    return <>
      <p className="text-lg font-bold text-muted-foreground">—</p>
      <p className="text-xs text-muted-foreground">Tarifas en {rateCurrency}; no comparable contra lo facturado en MXN.</p>
    </>;
  }
  return <>
    <p className={`text-lg font-bold ${remaining <= 0 ? "text-success" : "text-warning"}`}>{formatCurrency(remaining)}</p>
    <p className="text-xs text-muted-foreground">{remaining <= 0 ? "Al día" : "Pendiente"}</p>
  </>;
}

function invoiceVerification(invoices: { subtotal: number | null }[] | undefined, loading: boolean, error: boolean) {
  const complete = invoices?.every((invoice) => invoice.subtotal !== null) ?? false;
  const verified = !loading && !error && complete;
  if (loading) return { verified, notice: "Verificando facturas." };
  if (error || invoices === undefined) return { verified, notice: "No se pudieron verificar las facturas." };
  return { verified, notice: "No se pudo atribuir lo facturado a esta reserva. Revisa las partidas y sus vínculos." };
}

export function RentalFinancialSummary({
  bookingId,
  startDate,
  endDate,
  dailyRate,
  weeklyRate,
  monthlyRate,
}: RentalFinancialSummaryProps) {
  const { data: invoices, isLoading: invoicesLoading, isError: invoicesError } = useContractFinancialSummary(bookingId);
  const { data: booking, isLoading: bookingLoading, isError: bookingError } = useBooking(bookingId);
  const revenue = useContractRevenueVerification(booking, bookingLoading, bookingError, {
    start_date: startDate, end_date: endDate, daily_rate: dailyRate, weekly_rate: weeklyRate, monthly_rate: monthlyRate,
  });
  // Ronda D·#4: las tarifas del contrato están en la moneda de la reserva.
  // Lo facturado ya viene normalizado a MXN, así que comparar 1:1 contra una
  // reserva en USD inventaba un "balance restante" falso.
  const rateCurrency = ((booking as { currency?: string | null } | undefined)?.currency ?? "MXN").toUpperCase();
  const isForeignRate = rateCurrency !== "MXN";

  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  const days = rentalDaysInclusive(start, end);
  const items = calculateRentalCost(dailyRate, weeklyRate, monthlyRate, start, end);
  const expectedRevenue = revenue.expectedRevenue ?? sumMoney(items.map((item) => item.total));
  // M-14: expectedRevenue es sin IVA → comparar contra el SUBTOTAL de las
  // facturas (antes se usaba `total`, con IVA, y el balance restante salía
  // artificialmente negativo).
  const invoicedAmount = sumMoney((invoices || []).map((inv) => Number(inv.subtotal)));
  const remaining = sumMoney([expectedRevenue, -invoicedAmount]);
  const invoiceCount = invoices?.length || 0;
  const { verified: invoicesVerified, notice: invoiceNotice } = invoiceVerification(invoices, invoicesLoading, invoicesError);


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumen Financiero</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <TrendingUpIcon className="h-3.5 w-3.5" />
              Ingreso Esperado
            </div>
            <ExpectedRevenue revenue={revenue} value={expectedRevenue} currency={rateCurrency} />
            <p className="text-xs text-muted-foreground">{days} días</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <DocumentIcon className="h-3.5 w-3.5" />
              Facturado
            </div>
            <p className="text-lg font-bold">{invoicesVerified ? formatCurrency(invoicedAmount) : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {invoicesVerified ? `${invoiceCount} factura${invoiceCount !== 1 ? "s" : ""}` : invoiceNotice}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <MoneyIcon className="h-3.5 w-3.5" />
              Balance Restante
            </div>
            <RemainingBalance
              canCompare={revenue.status === "verified" && invoicesVerified}
              isForeignRate={isForeignRate}
              rateCurrency={rateCurrency}
              remaining={remaining}
              notice={revenue.status !== "verified" ? "Verifica el importe pactado para comparar el balance." : invoiceNotice}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
