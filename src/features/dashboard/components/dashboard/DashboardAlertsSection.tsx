import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_ALERT_ORDER, type DashboardAlertGroup, type DashboardPriority } from "../../lib/dashboardPriority";
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
  priority?: DashboardPriority;
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

function AlertGroup({ group, ...props }: DashboardAlertsSectionProps & { group: DashboardAlertGroup }) {
  return (
    <>
      <AlertsRow
        overdueInvoices={group === "collection" ? props.overdueInvoices : []}
        maintenanceAlerts={group === "maintenance" ? props.maintenanceAlerts : []}
        agingBuckets={group === "collection" ? props.agingBuckets : []}
        overdueBookings={group === "returns" ? props.overdueBookings : []}
        pendingDeliveriesCount={group === "transport" ? props.pendingDeliveriesCount : 0}
        canManageInvoices={props.canManageInvoices}
        canManageReturns={props.canManageReturns}
        canManageMaintenance={props.canManageMaintenance}
      />
      {group === "collection" && <AlertQuery state={props.collectionForecast} entity="la previsión de cobranza">
        {(upcomingInvoices) => <CollectionForecast overdueInvoices={props.overdueInvoices} upcomingInvoices={upcomingInvoices} />}
      </AlertQuery>}
      {group === "returns" && <ExpiringContractsAlert contracts={props.expiringContracts} />}
      {group === "maintenance" && <AlertQuery state={props.insuranceAlert} entity="las alertas de seguros">
        {(data) => <InsuranceAlert data={data} />}
      </AlertQuery>}
    </>
  );
}

export function DashboardAlertsSection({ priority = "overview", ...props }: DashboardAlertsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      {DASHBOARD_ALERT_ORDER[priority].map((group) => <AlertGroup key={group} group={group} {...props} />)}
    </div>
  );
}
