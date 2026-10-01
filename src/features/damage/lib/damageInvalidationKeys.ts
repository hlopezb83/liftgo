import { reportKeys } from "@/features/reports";
import { operationSummaryKeys } from "@/lib/query/operationSummaryKeys";

/** Damage changes can block or release a unit and update its repair order. */
export const damageInvalidationKeys = [
  ["damage_records"], ["damage_photo_counts"], ["forklifts"], ["fleet"],
  ["status_logs"], ["maintenance_logs"], ["bookings"], ["return_inspections"],
  ["sidebar-badge-counts"], ["calendar-maintenance-windows"], reportKeys.all,
  operationSummaryKeys.dashboardStats.all, operationSummaryKeys.fleetLocations.all,
  operationSummaryKeys.forkliftLocation.all, operationSummaryKeys.forkliftFinancials.all,
] as const;
