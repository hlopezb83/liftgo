import { useState } from "react";
import { useForklifts, useBookings, useInvoices, useMaintenanceLogs } from "@/hooks/useForkliftData";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { UtilizationReport } from "@/components/reports/UtilizationReport";
import type { DateRange } from "react-day-picker";
import { RevenueReport } from "@/components/reports/RevenueReport";
import { MaintenanceCostReport } from "@/components/reports/MaintenanceCostReport";
import { subMonths } from "date-fns";

const REPORT_TYPES = [
  { value: "utilization", label: "Fleet Utilization" },
  { value: "revenue", label: "Revenue" },
  { value: "maintenance", label: "Maintenance Costs" },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState("utilization");
  const [dateRange, setDateRange] = useState<DateRange>({ from: subMonths(new Date(), 3), to: new Date() });
  const startDate = dateRange?.from ?? subMonths(new Date(), 3);
  const endDate = dateRange?.to ?? new Date();

  const { data: forklifts } = useForklifts();
  const { data: bookings } = useBookings();
  const { data: invoices } = useInvoices();
  const { data: maintenanceLogs } = useMaintenanceLogs();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Reports & Analytics" subtitle="Generate filtered reports with export" />

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap items-end">
            <div className="space-y-1.5">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DateRangePickerField label="Date Range" dateRange={dateRange} onSelect={(r) => r && setDateRange(r)} />
          </div>
        </CardContent>
      </Card>

      {reportType === "utilization" && (
        <UtilizationReport forklifts={forklifts || []} bookings={bookings || []} startDate={startDate} endDate={endDate} />
      )}
      {reportType === "revenue" && (
        <RevenueReport invoices={invoices || []} startDate={startDate} endDate={endDate} />
      )}
      {reportType === "maintenance" && (
        <MaintenanceCostReport maintenanceLogs={maintenanceLogs || []} forklifts={forklifts || []} startDate={startDate} endDate={endDate} />
      )}
    </div>
  );
}
