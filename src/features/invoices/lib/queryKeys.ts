/**
 * Query key factory para la feature `invoices`.
 *
 * Resuelve la inconsistencia detectada en la auditoría (algunos hooks usan
 * `["invoice", id]` en singular y otros `["invoices", id]` en plural para el
 * mismo recurso). Todos los nuevos hooks deben consumir este objeto en lugar
 * de literales sueltos.
 *
 * Patrón TanStack Query: jerárquico desde la raíz `all` para que una sola
 * `invalidateQueries({ queryKey: invoiceKeys.all })` invalide todo el árbol.
 */
export const invoiceKeys = {
  all: ["invoices"] as const,
  lists: () => [...invoiceKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...invoiceKeys.lists(), filters] as const,
  withBalance: (params: {
    statuses?: readonly string[];
    dueFrom?: string | null;
    dueTo?: string | null;
    withBalanceOnly?: boolean;
  }) =>
    [
      ...invoiceKeys.all,
      "with-balance",
      params.statuses ?? null,
      params.dueFrom ?? null,
      params.dueTo ?? null,
      params.withBalanceOnly ?? null,
    ] as const,
  upcoming: () => [...invoiceKeys.all, "upcoming"] as const,
  nextNumber: () => [...invoiceKeys.all, "next-number"] as const,
  details: () => [...invoiceKeys.all, "detail"] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
} as const;

export const paymentKeys = {
  all: ["payments"] as const,
  byInvoice: (invoiceId: string) => [...paymentKeys.all, invoiceId] as const,
} as const;

export const creditNoteKeys = {
  all: ["credit_notes"] as const,
  byInvoice: (invoiceId: string) =>
    [...creditNoteKeys.all, "invoice", invoiceId] as const,
} as const;

export const collectionNoteKeys = {
  all: ["collection_notes"] as const,
  byInvoice: (invoiceId: string) =>
    [...collectionNoteKeys.all, invoiceId] as const,
} as const;
