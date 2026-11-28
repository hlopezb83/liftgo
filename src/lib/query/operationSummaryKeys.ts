import { createEntityKeys } from "./createEntityKeys";

const damageRecordsBase = createEntityKeys("damage_records");
const sidebarBadgeCountsBase = createEntityKeys("sidebar-badge-counts");
const sidebarOrganizationNameBase = createEntityKeys("sidebar-organization-name");
const calendarMaintenanceWindowsBase = createEntityKeys("calendar-maintenance-windows");

// Contratos ligeros compartidos por las consultas y mutaciones de operación.
// Evitan importar componentes o autenticación sólo para invalidar una vista.
export const operationSummaryKeys = {
  dashboardStats: createEntityKeys("dashboard-stats"),
  dashboardFinancialKpis: createEntityKeys("dashboard-financial-kpis"),
  cashFlow: createEntityKeys("cash-flow"),
  fleetLocations: createEntityKeys("fleet_locations"),
  forkliftLocation: createEntityKeys("forklift-location"),
  forkliftFinancials: createEntityKeys("forklift-financials"),
  forklifts: createEntityKeys("forklifts"),
  fleet: createEntityKeys("fleet"),
  statusLogs: createEntityKeys("status_logs"),
  maintenanceLogs: createEntityKeys("maintenance_logs"),
  bookings: createEntityKeys("bookings"),
  returnInspections: createEntityKeys("return_inspections"),
  damageRecords: {
    ...damageRecordsBase,
    byMaintenanceLog: (maintenanceLogId: string | null | undefined) =>
      [...damageRecordsBase.all, "byMaintenanceLog", maintenanceLogId] as const,
    invoicePrefill: (identity: unknown, damageId: string | null) =>
      [...damageRecordsBase.all, "invoice-prefill", identity, damageId] as const,
  },
  sidebarBadgeCounts: {
    ...sidebarBadgeCountsBase,
    byScope: (userId: string | undefined, organizationId: string | null | undefined) =>
      [...sidebarBadgeCountsBase.all, userId, organizationId] as const,
  },
  sidebarOrganizationName: {
    ...sidebarOrganizationNameBase,
    byOrg: (organizationId: string | null | undefined) =>
      [...sidebarOrganizationNameBase.all, organizationId] as const,
  },
  calendarMaintenanceWindows: {
    ...calendarMaintenanceWindowsBase,
    byRange: (start: string, end: string, includeE2e: boolean) =>
      [...calendarMaintenanceWindowsBase.all, start, end, includeE2e] as const,
  },
} as const;
