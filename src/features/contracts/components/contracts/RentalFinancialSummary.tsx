import { MoneyIcon, DocumentIcon, TrendingUpIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rentalDaysInclusive } from "@/features/bookings/lib/rentalDays";
import { calculateRentalCost } from "@/lib/domain/invoiceHelpers";
import { formatCurrency } from "@/lib/format/formatCurrency";
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

  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  const days = rentalDaysInclusive(start, end);
  const items = calculateRentalCost(dailyRate, weeklyRate, monthlyRate, start, end);
  const expectedRevenue = items.reduce((sum, item) => sum + item.total, 0);
  const invoicedAmount = (invoices || []).reduce((sum, inv) => sum + Number(inv.total), 0);
  const remaining = expectedRevenue - invoicedAmount;
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
              Revenue Esperado
            </div>
            <p className="text-lg font-bold">{formatCurrency(expectedRevenue)}</p>
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
            <p className={`text-lg font-bold ${remaining <= 0 ? "text-success" : "text-warning"}`}>
              {formatCurrency(remaining)}
            </p>
            <p className="text-xs text-muted-foreground">
              {remaining <= 0 ? "Al día" : "Pendiente"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
