import { FleetStatusChart } from "./FleetStatusChart";
import { UtilizationCharts } from "./UtilizationCharts";
import { CashFlowChart } from "./CashFlowChart";
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
