/**
 * Query key factory para la feature `fleet` (montacargas, modelos, choferes, seguros).
 * Usar en todos los hooks nuevos.
 */
export const forkliftKeys = {
  all: ["forklifts"] as const,
  lists: () => [...forkliftKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...forkliftKeys.lists(), filters] as const,
  available: (params: Record<string, unknown>) =>
    [...forkliftKeys.all, "available", params] as const,
  details: () => [...forkliftKeys.all, "detail"] as const,
  detail: (id: string) => [...forkliftKeys.details(), id] as const,
  financials: (id: string) => [...forkliftKeys.detail(id), "financials"] as const,
  location: (id: string) => [...forkliftKeys.detail(id), "location"] as const,
  map: () => [...forkliftKeys.all, "map"] as const,
} as const;

export const equipmentModelKeys = {
  all: ["equipment_models"] as const,
  list: () => [...equipmentModelKeys.all, "list"] as const,
  detail: (id: string) => [...equipmentModelKeys.all, "detail", id] as const,
} as const;

export const driverKeys = {
  all: ["drivers"] as const,
  list: () => [...driverKeys.all, "list"] as const,
} as const;

export const insuranceAlertKeys = {
  all: ["insurance_alerts"] as const,
} as const;
