import { reportKeys } from "@/features/reports";
import { operationSummaryKeys } from "@/lib/query/operationSummaryKeys";
import { damagePhotoCountsKeys, damageRecordKeys } from "./queryKeys";

/** Damage changes can block or release a unit and update its repair order. */
export const damageInvalidationKeys = [
  damageRecordKeys.all,
  damagePhotoCountsKeys.all,
  operationSummaryKeys.forklifts.all,
  operationSummaryKeys.fleet.all,
  operationSummaryKeys.statusLogs.all,
  operationSummaryKeys.maintenanceLogs.all,
  operationSummaryKeys.bookings.all,
  operationSummaryKeys.returnInspections.all,
  operationSummaryKeys.sidebarBadgeCounts.all,
  operationSummaryKeys.calendarMaintenanceWindows.all,
  reportKeys.all,
  operationSummaryKeys.dashboardStats.all,
  operationSummaryKeys.fleetLocations.all,
  operationSummaryKeys.forkliftLocation.all,
  operationSummaryKeys.forkliftFinancials.all,
] as const;
