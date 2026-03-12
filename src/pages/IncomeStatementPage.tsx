import { useState, useMemo } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IncomeStatementReport } from "@/components/reports/IncomeStatementReport";
import { useInvoices } from "@/hooks/useInvoices";
import { useMaintenanceLogs } from "@/hooks/useMaintenanceLogs";
import { useDamageRecords } from "@/hooks/useDamageRecords";
import { useOperatingExpenses } from "@/hooks/useOperatingExpenses";
import { useBookings } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { es } from "date-fns/locale";

function generateMonthOptions(count: number) {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = subMonths(now, i);
    const value = format(d, "yyyy-MM");
    const label = format(d, "MMMM yyyy", { locale: es });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}

export default function IncomeStatementPage() {
  const monthOptions = useMemo(() => generateMonthOptions(24), []);

  const [startMonth, setStartMonth] = useState(() => format(subMonths(new Date(), 3), "yyyy-MM"));
  const [endMonth, setEndMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [accountingBasis, setAccountingBasis] = useState<"accrual" | "cash">("accrual");

  const [sy, sm] = startMonth.split("-").map(Number);
  const startDate = startOfMonth(new Date(sy, sm - 1, 1));
  const [ey, em] = endMonth.split("-").map(Number);
  const endDate = endOfMonth(new Date(ey, em - 1, 1));

  const { data: invoices } = useInvoices();
  const { data: maintenanceLogs } = useMaintenanceLogs();
  const { data: damageRecords } = useDamageRecords();
  const { data: operatingExpenses } = useOperatingExpenses();
  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title="Estado de Resultados" subtitle="Análisis financiero detallado con depreciación de equipos" />

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Desde</Label>
                <Select value={startMonth} onValueChange={setStartMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hasta</Label>
                <Select value={endMonth} onValueChange={setEndMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <IncomeStatementReport
          invoices={invoices || []}
          maintenanceLogs={maintenanceLogs || []}
          damageRecords={damageRecords || []}
          operatingExpenses={operatingExpenses || []}
          bookings={bookings || []}
          forklifts={forklifts || []}
          startDate={startDate}
          endDate={endDate}
        />
      </div>
    </PageTransition>
  );
}
