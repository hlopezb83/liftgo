import { CashFlowChart } from "./CashFlowChart";
import { FleetStatusChart } from "./FleetStatusChart";
import { UtilizationCharts } from "./UtilizationCharts";
import type { ComponentProps } from "react";

type FleetProps = ComponentProps<typeof FleetStatusChart>;
type UtilizationProps = ComponentProps<typeof UtilizationCharts>;
type CashFlowProps = ComponentProps<typeof CashFlowChart>;

interface DashboardChartsSectionProps {
  pieData: FleetProps["data"];
  monthlyUtilization: UtilizationProps["monthlyUtilization"];
  revenuePerUnit: UtilizationProps["revenuePerUnit"];
  cashFlowData: CashFlowProps["data"];
}

export function DashboardChartsSection(props: DashboardChartsSectionProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-1">
        <FleetStatusChart data={props.pieData} />
      </div>
      <div className="xl:col-span-2">
        <UtilizationCharts monthlyUtilization={props.monthlyUtilization} revenuePerUnit={props.revenuePerUnit} />
      </div>
      <div className="xl:col-span-3">
        <CashFlowChart data={props.cashFlowData} />
      </div>
    </div>
  );
}

