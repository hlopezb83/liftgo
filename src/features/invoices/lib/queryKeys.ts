/**
 * Query key factory para la feature `invoices`.
 *
 * Todos los namespaces derivan de `createEntityKeys` para garantizar una
 * estructura jerárquica consistente (`all` → `list`/`detail`). Las keys
 * especializadas (`withBalance`, `reconciliation`, etc.) extienden la base
 * sin romper el patrón de invalidación por scope.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

const invoiceBase = createEntityKeys("invoices");

export const invoiceKeys = {
  ...invoiceBase,
  byFilter: (filters: Record<string, unknown>) => invoiceBase.byFilter(filters),
  /** Alias retro-compatible para consumidores que usan `invoiceKeys.list(...)`. */
  list: (filters: Record<string, unknown>) => invoiceBase.byFilter(filters),
  withBalance: (params: {
    statuses?: readonly string[];
    dueFrom?: string | null;
    dueTo?: string | null;
    withBalanceOnly?: boolean;
    limit?: number | null;
    offset?: number | null;
  }) =>
    [
      ...invoiceBase.all,
      "with-balance",
      params.statuses ?? null,
      params.dueFrom ?? null,
      params.dueTo ?? null,
      params.withBalanceOnly ?? null,
      params.limit ?? null,
      params.offset ?? null,
    ] as const,
  upcoming: () => [...invoiceBase.all, "upcoming"] as const,
  nextNumber: () => [...invoiceBase.all, "next-number"] as const,
  byQuote: (quoteId: string) => [...invoiceBase.all, "quote", quoteId] as const,
  reconciliation: (filters: {
    from: string;
    to: string;
    fiscalState: string;
    env: string;
  }) => [...invoiceBase.all, "reconciliation", filters] as const,
} as const;

const paymentBase = createEntityKeys("payments");

export const paymentKeys = {
  ...paymentBase,
  byInvoice: (invoiceId: string) => [...paymentBase.all, invoiceId] as const,
} as const;

const creditNoteBase = createEntityKeys("credit_notes");

export const creditNoteKeys = {
  ...creditNoteBase,
  byInvoice: (invoiceId: string) =>
    [...creditNoteBase.all, "invoice", invoiceId] as const,
} as const;

const collectionNoteBase = createEntityKeys("collection_notes");

export const collectionNoteKeys = {
  ...collectionNoteBase,
  byInvoice: (invoiceId: string) =>
    [...collectionNoteBase.all, invoiceId] as const,
} as const;

const invoiceBookingBase = createEntityKeys("invoice_bookings");

export const invoiceBookingKeys = {
  ...invoiceBookingBase,
  byInvoice: (invoiceId: string) =>
    [...invoiceBookingBase.all, invoiceId] as const,
} as const;
