import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { IncomeStatementReport } from "@/components/reports/IncomeStatementReport";
import { useInvoices } from "@/hooks/useInvoices";
import { useMaintenanceLogs } from "@/hooks/useMaintenanceLogs";
import { useDamageRecords } from "@/hooks/useDamageRecords";
import { useOperatingExpenses } from "@/hooks/useOperatingExpenses";
import { useBookings } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { subMonths } from "date-fns";
import type { DateRange } from "react-day-picker";

export default function IncomeStatementPage() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: subMonths(new Date(), 3), to: new Date() });
  const startDate = dateRange?.from ?? subMonths(new Date(), 3);
  const endDate = dateRange?.to ?? new Date();

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
            <DateRangePickerField label="Rango de Fechas" dateRange={dateRange} onSelect={(r) => r && setDateRange(r)} />
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
