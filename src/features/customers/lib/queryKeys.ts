/**
 * Query key factory para la feature `customers`.
 */
export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...customerKeys.lists(), filters] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
  contacts: (customerId: string) =>
    [...customerKeys.detail(customerId), "contacts"] as const,
} as const;
