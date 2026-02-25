import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateRentalCost, computeTotals } from "@/lib/invoiceUtils";
import { formatCurrency } from "@/lib/formatCurrency";
import { differenceInDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, TrendingUp } from "lucide-react";

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
  const { data: invoices } = useQuery({
    queryKey: ["invoices", "booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("total, status")
        .eq("booking_id", bookingId)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
  const items = calculateRentalCost(dailyRate, weeklyRate, monthlyRate, days);
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
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <TrendingUp className="h-3.5 w-3.5" />
              Revenue Esperado
            </div>
            <p className="text-lg font-bold">{formatCurrency(expectedRevenue)}</p>
            <p className="text-xs text-muted-foreground">{days} días</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <FileText className="h-3.5 w-3.5" />
              Facturado
            </div>
            <p className="text-lg font-bold">{formatCurrency(invoicedAmount)}</p>
            <p className="text-xs text-muted-foreground">{invoiceCount} factura{invoiceCount !== 1 ? "s" : ""}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <DollarSign className="h-3.5 w-3.5" />
              Balance Restante
            </div>
            <p className={`text-lg font-bold ${remaining <= 0 ? "text-green-600" : "text-amber-600"}`}>
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
