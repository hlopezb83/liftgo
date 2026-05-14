import { AlertsRow } from "@/features/dashboard/components/dashboard/AlertsRow";
import { CollectionForecast } from "@/features/dashboard/components/dashboard/CollectionForecast";
import { ExpiringContractsAlert } from "@/features/dashboard/components/dashboard/ExpiringContractsAlert";
import { InsuranceAlert } from "@/features/dashboard/components/dashboard/InsuranceAlert";
import type { ComponentProps } from "react";

type AlertsRowProps = ComponentProps<typeof AlertsRow>;
type CollectionForecastProps = ComponentProps<typeof CollectionForecast>;
type ExpiringContractsAlertProps = ComponentProps<typeof ExpiringContractsAlert>;
type InsuranceAlertProps = ComponentProps<typeof InsuranceAlert>;

interface DashboardAlertsSectionProps {
  overdueInvoices: AlertsRowProps["overdueInvoices"];
  maintenanceAlerts: AlertsRowProps["maintenanceAlerts"];
  agingBuckets: AlertsRowProps["agingBuckets"];
  overdueBookings: AlertsRowProps["overdueBookings"];
  upcomingInvoices: CollectionForecastProps["upcomingInvoices"];
  expiringContracts: ExpiringContractsAlertProps["contracts"];
  insuranceData: InsuranceAlertProps["data"];
}

export function DashboardAlertsSection(props: DashboardAlertsSectionProps) {
  return (
    <>
      <AlertsRow
        overdueInvoices={props.overdueInvoices}
        maintenanceAlerts={props.maintenanceAlerts}
        agingBuckets={props.agingBuckets}
        overdueBookings={props.overdueBookings}
      />
      <CollectionForecast overdueInvoices={props.overdueInvoices} upcomingInvoices={props.upcomingInvoices} />
      <ExpiringContractsAlert contracts={props.expiringContracts} />
      <InsuranceAlert data={props.insuranceData} />
    </>
  );
}
