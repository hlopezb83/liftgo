import { createEntityKeys } from "./createEntityKeys";

// Contratos ligeros compartidos por las consultas y mutaciones de operación.
// Evitan importar componentes o autenticación sólo para invalidar una vista.
export const operationSummaryKeys = {
  dashboardStats: createEntityKeys("dashboard-stats"),
  fleetLocations: createEntityKeys("fleet_locations"),
} as const;
