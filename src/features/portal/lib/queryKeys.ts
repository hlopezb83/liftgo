/**
 * Query keys y tipos puros para la feature `portal`.
 *
 * Las query definitions con I/O viven en `./portalQueries`.
 * Los payment intents viven en `@/features/invoices/lib/paymentIntentsQueryKeys`
 * (donde son consumidos) para evitar el ciclo `invoices → portal`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export interface PortalQuoteListRow {
  id: string;
  quote_number: string;
  status: string;
  valid_until: string | null;
  total: number;
  currency: string;
  created_at: string;
}

export interface PortalQuoteDetailRow extends PortalQuoteListRow {
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  line_items: unknown[] | null;
  accepted_at: string | null;
}

export interface PortalCollectionAccount {
  bank: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  currency: string | null;
}

export const portalQuoteKeys = createEntityKeys("portal_quotes");

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
