import { FleetStatusChart } from "@/components/dashboard/FleetStatusChart";
import { InvoiceBreakdown } from "@/components/dashboard/InvoiceBreakdown";
import { UtilizationCharts } from "@/components/dashboard/UtilizationCharts";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import type { ComponentProps } from "react";

type FleetProps = ComponentProps<typeof FleetStatusChart>;
type InvoiceProps = ComponentProps<typeof InvoiceBreakdown>;
type UtilizationProps = ComponentProps<typeof UtilizationCharts>;
type CashFlowProps = ComponentProps<typeof CashFlowChart>;

interface DashboardChartsSectionProps {
  pieData: FleetProps["data"];
  invoiceBreakdown: InvoiceProps["data"];
  outstandingRevenue: number;
  weeklyUtilization: UtilizationProps["weeklyUtilization"];
  revenuePerUnit: UtilizationProps["revenuePerUnit"];
  cashFlowData: CashFlowProps["data"];
}

export function DashboardChartsSection(props: DashboardChartsSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FleetStatusChart data={props.pieData} />
        <InvoiceBreakdown data={props.invoiceBreakdown} outstandingRevenue={props.outstandingRevenue} />
      </div>
      <UtilizationCharts weeklyUtilization={props.weeklyUtilization} revenuePerUnit={props.revenuePerUnit} />
      <CashFlowChart data={props.cashFlowData} />
    </>
  );
}
