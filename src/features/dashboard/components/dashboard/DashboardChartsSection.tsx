import { FleetStatusChart } from "@/features/dashboard/components/dashboard/FleetStatusChart";
import { UtilizationCharts } from "@/features/dashboard/components/dashboard/UtilizationCharts";
import { CashFlowChart } from "@/features/dashboard/components/dashboard/CashFlowChart";
import type { ComponentProps } from "react";

type FleetProps = ComponentProps<typeof FleetStatusChart>;
type UtilizationProps = ComponentProps<typeof UtilizationCharts>;
type CashFlowProps = ComponentProps<typeof CashFlowChart>;

interface DashboardChartsSectionProps {
  pieData: FleetProps["data"];
  weeklyUtilization: UtilizationProps["weeklyUtilization"];
  revenuePerUnit: UtilizationProps["revenuePerUnit"];
  cashFlowData: CashFlowProps["data"];
}

export function DashboardChartsSection(props: DashboardChartsSectionProps) {
  return (
    <>
      <FleetStatusChart data={props.pieData} />
      <UtilizationCharts weeklyUtilization={props.weeklyUtilization} revenuePerUnit={props.revenuePerUnit} />
      <CashFlowChart data={props.cashFlowData} />
    </>
  );
}
