import { reportKeys } from "@/features/reports";
import { operationSummaryKeys } from "@/lib/query/operationSummaryKeys";
import { maintenanceLogKeys } from "./queryKeys";

/** Maintenance transitions also change physical availability and its summaries. */
export const maintenanceInvalidationKeys = [
  maintenanceLogKeys.all,
  reportKeys.all,
  ["forklifts"],
  ["status_logs"],
  ["damage_records"],
  ["calendar-maintenance-windows"],
  ["sidebar-badge-counts"],
  operationSummaryKeys.dashboardStats.all,
  operationSummaryKeys.fleetLocations.all,
  operationSummaryKeys.forkliftLocation.all,
  operationSummaryKeys.forkliftFinancials.all,
] as const;
