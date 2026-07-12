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
} as const;

export const portalKeys = {
  all: ["portal"] as const,
  customer: (userId?: string) => [...portalKeys.all, "customer", userId] as const,
  bookings: (userId?: string) => [...portalKeys.all, "bookings", userId] as const,
  invoices: (userId?: string) => [...portalKeys.all, "invoices", userId] as const,
  contracts: (userId?: string) => [...portalKeys.all, "contracts", userId] as const,
  payments: (userId?: string) => [...portalKeys.all, "payments", userId] as const,
} as const;
