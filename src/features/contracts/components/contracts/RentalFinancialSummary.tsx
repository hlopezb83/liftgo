import { MoneyIcon, DocumentIcon, TrendingUpIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rentalDaysInclusive, useBooking } from "@/features/bookings";
import { calculateRentalCost } from "@/lib/domain/invoiceHelpers";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { sumMoney } from "@/lib/money";
import { parseDateLocal } from "@/lib/utils";
import { useContractFinancialSummary } from "../../hooks/contractDetail/useContractFinancialSummary";

interface RentalFinancialSummaryProps {
  bookingId: string;
  startDate: string;
  endDate: string;
  dailyRate: number | null;
  weeklyRate: number | null;
  monthlyRate: number | null;
}

export function RentalFinancialSummary({
  bookingId,
  startDate,
  endDate,
  dailyRate,
  weeklyRate,
  monthlyRate,
}: RentalFinancialSummaryProps) {
  const { data: invoices } = useContractFinancialSummary(bookingId);
  const { data: booking } = useBooking(bookingId);
  // Ronda D·#4: las tarifas del contrato están en la moneda de la reserva.
  // Lo facturado ya viene normalizado a MXN, así que comparar 1:1 contra una
  // reserva en USD inventaba un "balance restante" falso.
  const rateCurrency = ((booking as { currency?: string | null } | undefined)?.currency ?? "MXN").toUpperCase();
  const isForeignRate = rateCurrency !== "MXN";

  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  const days = rentalDaysInclusive(start, end);
  const items = calculateRentalCost(dailyRate, weeklyRate, monthlyRate, start, end);
  const expectedRevenue = sumMoney(items.map((item) => item.total));
  // M-14: expectedRevenue es sin IVA → comparar contra el SUBTOTAL de las
  // facturas (antes se usaba `total`, con IVA, y el balance restante salía
  // artificialmente negativo).
  const invoicedAmount = sumMoney((invoices || []).map((inv) => Number(inv.subtotal)));
  const remaining = sumMoney([expectedRevenue, -invoicedAmount]);
  const invoiceCount = invoices?.length || 0;


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
            <p className="text-lg font-bold">{formatCurrencyWithCode(expectedRevenue, rateCurrency)}</p>
            <p className="text-xs text-muted-foreground">{days} días</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <DocumentIcon className="h-3.5 w-3.5" />
              Facturado
            </div>
            <p className="text-lg font-bold">{formatCurrency(invoicedAmount)}</p>
            <p className="text-xs text-muted-foreground">{invoiceCount} factura{invoiceCount !== 1 ? "s" : ""}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <MoneyIcon className="h-3.5 w-3.5" />
              Balance Restante
            </div>
            {isForeignRate ? (
              <>
                <p className="text-lg font-bold text-muted-foreground">—</p>
                <p className="text-xs text-muted-foreground">
                  Tarifas en {rateCurrency}; no comparable contra lo facturado en MXN.
                </p>
              </>
            ) : (
              <>
                <p className={`text-lg font-bold ${remaining <= 0 ? "text-success" : "text-warning"}`}>
                  {formatCurrency(remaining)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {remaining <= 0 ? "Al día" : "Pendiente"}
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
