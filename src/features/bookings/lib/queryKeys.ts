/**
 * Query key factory para la feature `bookings`.
 * Usar en todos los hooks nuevos. Migración de literales existentes es incremental.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

const baseKeys = createEntityKeys("bookings");

export const bookingKeys = {
  ...baseKeys,
  list: (filters: Record<string, unknown>) => baseKeys.byFilter(filters),
  byCustomer: (customerId: string) =>
    [...bookingKeys.all, "customer", customerId] as const,
  byForklift: (forkliftId: string) =>
    [...bookingKeys.all, "forklift", forkliftId] as const,
  /** M-17: prefijo para invalidar TODOS los listados por montacargas. */
  byForkliftAll: () => [...bookingKeys.all, "forklift"] as const,
  /** Prefijo del listado por rango de fechas (drilldown de utilización / calendario). */
  range: () => [...bookingKeys.all, "range"] as const,
  extensions: (bookingId: string) =>
    [...bookingKeys.detail(bookingId), "extensions"] as const,
  auditLogs: (bookingId: string) =>
    [...bookingKeys.detail(bookingId), "audit-logs"] as const,
} as const;
