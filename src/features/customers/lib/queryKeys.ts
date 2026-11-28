/**
 * Query key factory para la feature `customers`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

const baseKeys = createEntityKeys("customers");

export const customerKeys = {
  ...baseKeys,
  list: (filters: Record<string, unknown>) => baseKeys.byFilter(filters),
  contacts: (customerId: string) =>
    [...customerKeys.detail(customerId), "contacts"] as const,
  profitability: (customerId: string) =>
    [...customerKeys.detail(customerId), "profitability"] as const,
  summary: (customerId: string) =>
    [...customerKeys.detail(customerId), "summary"] as const,
  /** Tramo 9: cuenta de portal del cliente en la empresa del usuario (scoped). */
  portalAccount: (customerId: string) =>
    [...customerKeys.detail(customerId), "portal-account"] as const,
} as const;
