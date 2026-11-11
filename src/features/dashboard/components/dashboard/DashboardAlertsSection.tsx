import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsRow } from "./AlertsRow";
import { CollectionForecast } from "./CollectionForecast";
import { ExpiringContractsAlert } from "./ExpiringContractsAlert";
import { InsuranceAlert } from "./InsuranceAlert";
import type { DashboardAlertState } from "../../lib/dashboardSectionHelpers";
import type { ComponentProps, ReactNode } from "react";

type AlertsRowProps = ComponentProps<typeof AlertsRow>;
type CollectionForecastProps = ComponentProps<typeof CollectionForecast>;
type ExpiringContractsAlertProps = ComponentProps<typeof ExpiringContractsAlert>;
type InsuranceAlertProps = ComponentProps<typeof InsuranceAlert>;

interface DashboardAlertsSectionProps {
  overdueInvoices: AlertsRowProps["overdueInvoices"];
  maintenanceAlerts: AlertsRowProps["maintenanceAlerts"];
  agingBuckets: AlertsRowProps["agingBuckets"];
  overdueBookings: AlertsRowProps["overdueBookings"];
  collectionForecast: DashboardAlertState<NonNullable<CollectionForecastProps["upcomingInvoices"]>>;
  expiringContracts: ExpiringContractsAlertProps["contracts"];
  insuranceAlert: DashboardAlertState<NonNullable<InsuranceAlertProps["data"]>>;
  pendingDeliveriesCount?: number;
  canManageInvoices: boolean;
  canManageReturns: boolean;
  canManageMaintenance: boolean;
}

function AlertQuery<T>({ state, entity, children }: {
  state: DashboardAlertState<T>;
  entity: string;
  children: (data: T) => ReactNode;
}) {
  switch (state.status) {
    case "hidden":
      return null;
    case "loading":
      return <div role="status"><span className="sr-only">Cargando {entity}…</span><Skeleton className="h-24 rounded-xl" /></div>;
    case "error":
      return <QueryErrorState entity={entity} error={state.error} onRetry={state.onRetry} isRetrying={state.isRetrying} />;
    case "ready":
      return children(state.data);
  }
}

export function DashboardAlertsSection(props: DashboardAlertsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <AlertsRow
        overdueInvoices={props.overdueInvoices}
        maintenanceAlerts={props.maintenanceAlerts}
        agingBuckets={props.agingBuckets}
        overdueBookings={props.overdueBookings}
        pendingDeliveriesCount={props.pendingDeliveriesCount}
        canManageInvoices={props.canManageInvoices}
        canManageReturns={props.canManageReturns}
        canManageMaintenance={props.canManageMaintenance}
      />
      <AlertQuery state={props.collectionForecast} entity="la previsión de cobranza">
        {(upcomingInvoices) => <CollectionForecast overdueInvoices={props.overdueInvoices} upcomingInvoices={upcomingInvoices} />}
      </AlertQuery>
      <ExpiringContractsAlert contracts={props.expiringContracts} />
      <AlertQuery state={props.insuranceAlert} entity="las alertas de seguros">
        {(data) => <InsuranceAlert data={data} />}
      </AlertQuery>
    </div>
  );
}
