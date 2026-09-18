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

/**
 * Claves del portal. `scope` es la identidad verificada en servidor
 * (usuario + organización + tipo de miembro), no un `user_id` suelto: el mismo
 * cliente global puede existir en varias empresas y sus datos no deben
 * compartir entrada de caché.
 */
export const portalKeys = {
  all: ["portal"] as const,
  customer: (scope?: string) => [...portalKeys.all, "customer", scope] as const,
  bookings: (scope?: string) => [...portalKeys.all, "bookings", scope] as const,
  invoices: (scope?: string) => [...portalKeys.all, "invoices", scope] as const,
  invoice: (invoiceId?: string, scope?: string) =>
    [...portalKeys.all, "invoice", scope, invoiceId] as const,
  contracts: (scope?: string) => [...portalKeys.all, "contracts", scope] as const,
  payments: (scope?: string) => [...portalKeys.all, "payments", scope] as const,
  invoicePayments: (invoiceId?: string, scope?: string) =>
    [...portalKeys.all, "payments", scope, "invoice", invoiceId] as const,
} as const;
