/**
 * Query key factory para la feature `bookings`.
 * Usar en todos los hooks nuevos. Migración de literales existentes es incremental.
 */
export const bookingKeys = {
  all: ["bookings"] as const,
  lists: () => [...bookingKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...bookingKeys.lists(), filters] as const,
  details: () => [...bookingKeys.all, "detail"] as const,
  detail: (id: string) => [...bookingKeys.details(), id] as const,
  byCustomer: (customerId: string) =>
    [...bookingKeys.all, "customer", customerId] as const,
  byForklift: (forkliftId: string) =>
    [...bookingKeys.all, "forklift", forkliftId] as const,
  extensions: (bookingId: string) =>
    [...bookingKeys.detail(bookingId), "extensions"] as const,
} as const;
